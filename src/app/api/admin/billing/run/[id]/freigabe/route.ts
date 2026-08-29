import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';
import { createPaymentIntent } from '@/lib/billing/stripe';
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

  if (!mandate?.provider_customer_id || !mandate?.provider_mandate_id) {
    await admin
      .from('billing_runs')
      .update({ status: 'rechnung_erstellt' })
      .eq('id', id);

    return NextResponse.json({
      status: 'freigegeben',
      warnung: 'Kein gültiges SEPA-Mandat. Rechnung freigegeben, aber Zahlung muss manuell erfolgen.',
    });
  }

  try {
    const amountCents = Math.round(Number(run.betrag_brutto) * 100);

    const { data: agency } = await admin
      .from('agencies')
      .select('name')
      .eq('id', run.agency_id)
      .single();

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
