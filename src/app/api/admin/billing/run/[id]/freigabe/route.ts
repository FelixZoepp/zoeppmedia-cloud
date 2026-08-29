import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';
import { createPaymentIntent, createCheckoutSession } from '@/lib/billing/stripe';
import { logApiCall } from '@/lib/billing/lexoffice';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  }

  const body = await request.json();
  const { action, ablehnungsgrund } = body as {
    action: 'freigeben' | 'ablehnen';
    ablehnungsgrund?: string;
  };

  if (!action || !['freigeben', 'ablehnen'].includes(action)) {
    return NextResponse.json({ error: 'action muss "freigeben" oder "ablehnen" sein' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get the billing run
  const { data: run } = await admin
    .from('billing_runs')
    .select('*')
    .eq('id', id)
    .single();

  if (!run) {
    return NextResponse.json({ error: 'Billing-Run nicht gefunden' }, { status: 404 });
  }

  if (run.status !== 'rechnung_erstellt') {
    return NextResponse.json({ error: `Freigabe nur möglich bei Status "rechnung_erstellt" (aktuell: ${run.status})` }, { status: 400 });
  }

  // Get current user for audit
  const { data: { user } } = await supabase.auth.getUser();

  if (action === 'ablehnen') {
    if (!ablehnungsgrund) {
      return NextResponse.json({ error: 'Ablehnungsgrund ist Pflicht' }, { status: 400 });
    }

    await admin
      .from('billing_runs')
      .update({
        freigabe_status: 'abgelehnt',
        freigabe_von: user?.id,
        freigabe_am: new Date().toISOString(),
        ablehnungsgrund,
        status: 'storniert',
      })
      .eq('id', id);

    return NextResponse.json({ status: 'abgelehnt', ablehnungsgrund });
  }

  // action === 'freigeben'
  await admin
    .from('billing_runs')
    .update({
      freigabe_status: 'freigegeben',
      freigabe_von: user?.id,
      freigabe_am: new Date().toISOString(),
    })
    .eq('id', id);

  // Now trigger the actual payment
  const { data: mandate } = await admin
    .from('mandates')
    .select('*')
    .eq('agency_id', run.agency_id)
    .eq('status', 'gueltig')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Get agency data for email
  const { data: agency } = await admin
    .from('agencies')
    .select('name, contact_name, email')
    .eq('id', run.agency_id)
    .single();

  if (!mandate?.provider_customer_id || !mandate?.provider_mandate_id) {
    // No valid mandate — generate Stripe Checkout link and send per email
    try {
      let customerId = mandate?.provider_customer_id;

      // Create Stripe customer if none exists
      if (!customerId) {
        const { createCustomer } = await import('@/lib/billing/stripe');
        customerId = await createCustomer(admin, {
          name: agency?.name || 'Kunde',
          email: agency?.email || '',
          agency_id: run.agency_id,
        });
      }

      const { checkoutUrl } = await createCheckoutSession(admin, {
        customerId,
        agency_id: run.agency_id,
        successUrl: `https://cloud.zoeppmedia.de/dashboard?zahlung=success`,
        cancelUrl: `https://cloud.zoeppmedia.de/dashboard?zahlung=abgebrochen`,
      });

      // Save checkout URL to mandate
      if (mandate) {
        await admin.from('mandates').update({ checkout_url: checkoutUrl }).eq('id', mandate.id);
      } else {
        await admin.from('mandates').insert({
          agency_id: run.agency_id,
          provider: 'stripe',
          provider_customer_id: customerId,
          status: 'angefragt',
          checkout_url: checkoutUrl,
        });
      }

      // Send email with checkout link
      if (agency?.email) {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY || '');
        await resend.emails.send({
          from: 'Zoepp Media Cloud <noreply@zoepp-gruppe.de>',
          to: agency.email,
          subject: `Rechnung ${run.lex_invoice_number || run.periode} — Zahlungslink`,
          html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: #DC2626; padding: 20px; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 20px;">Zoepp Media Cloud</h1>
              </div>
              <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                <p style="color: #111827; font-size: 16px;">Hallo ${agency.contact_name || 'Team'},</p>
                <p style="color: #4b5563;">eure Rechnung <strong>${run.lex_invoice_number || run.periode}</strong> über <strong>${Number(run.betrag_brutto).toFixed(2)} €</strong> ist bereit.</p>
                <p style="color: #4b5563;">Bitte richtet einmalig euer Zahlungskonto ein — danach laufen alle Folgerechnungen automatisch:</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${checkoutUrl}" style="background: #DC2626; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">Jetzt Zahlungskonto einrichten</a>
                </div>
                <p style="color: #9ca3af; font-size: 13px;">Der Link ist einmalig und führt zu unserem Zahlungspartner Stripe. Eure Bankdaten werden dort sicher verarbeitet.</p>
              </div>
            </div>
          `,
        });
      }

      await admin
        .from('billing_runs')
        .update({ status: 'zahlung_angestossen' })
        .eq('id', id);

      return NextResponse.json({
        status: 'freigegeben',
        checkout_url: checkoutUrl,
        email_gesendet: !!agency?.email,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannt';
      return NextResponse.json({
        status: 'freigegeben',
        warnung: `Freigegeben, aber Checkout-Link konnte nicht erstellt werden: ${msg}`,
      });
    }
  }

  try {
    const amountCents = Math.round(Number(run.betrag_brutto) * 100);
    const beschreibung = `${run.lex_invoice_number || run.periode} — ${agency?.name || run.agency_id}`;

    const { paymentIntentId } = await createPaymentIntent(admin, {
      customerId: mandate.provider_customer_id,
      paymentMethodId: mandate.provider_mandate_id,
      amount: amountCents,
      description: beschreibung,
      agency_id: run.agency_id,
      idempotency_key: run.idempotenz_schluessel,
      metadata: {
        billing_run_id: run.id,
        lex_invoice_id: run.lex_invoice_id || '',
      },
    });

    await admin
      .from('billing_runs')
      .update({
        stripe_payment_id: paymentIntentId,
        status: 'zahlung_angestossen',
      })
      .eq('id', id);

    return NextResponse.json({ status: 'zahlung_angestossen', stripe_payment_id: paymentIntentId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unbekannt';

    await logApiCall(admin, 'stripe', 'response', '/payment_intents', 'POST', null, { error: msg }, run.agency_id, true);

    return NextResponse.json({
      status: 'freigegeben',
      warnung: `Rechnung freigegeben, aber Stripe-Zahlung fehlgeschlagen: ${msg}`,
    });
  }
}
