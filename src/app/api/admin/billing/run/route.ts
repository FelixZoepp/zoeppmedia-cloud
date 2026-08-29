import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';
import { createInvoice, logApiCall } from '@/lib/billing/lexoffice';
import { createRecurringPayment } from '@/lib/billing/mollie';

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  }

  const body = await request.json();
  const { agency_ids, plan_id, periode } = body as {
    agency_ids: string[];
    plan_id: string;
    periode: string; // e.g. "2026-08"
  };

  // SECURITY: No mass runs — explicit agency_ids required, empty = abort
  if (!Array.isArray(agency_ids) || agency_ids.length === 0) {
    return NextResponse.json(
      { error: 'agency_ids darf nicht leer sein. Explizite Angabe erforderlich.' },
      { status: 400 }
    );
  }

  if (!plan_id || !periode) {
    return NextResponse.json(
      { error: 'plan_id und periode sind erforderlich' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const results: Array<{ agency_id: string; status: string; billing_run_id?: string; error?: string }> = [];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  for (const agencyId of agency_ids) {
    try {
      // Fetch the plan
      const { data: plan } = await admin
        .from('billing_plans')
        .select('*')
        .eq('id', plan_id)
        .eq('agency_id', agencyId)
        .single();

      if (!plan) {
        results.push({ agency_id: agencyId, status: 'fehler', error: 'Plan nicht gefunden für diese Agentur' });
        continue;
      }

      if (plan.status !== 'aktiv') {
        results.push({ agency_id: agencyId, status: 'fehler', error: `Plan ist nicht aktiv (Status: ${plan.status})` });
        continue;
      }

      // Build idempotency key
      const idempotenzSchluessel = `${agencyId}_${plan_id}_${periode}_${plan.typ}`;

      // Check idempotency — if billing run already exists, skip
      const { data: existingRun } = await admin
        .from('billing_runs')
        .select('id, status')
        .eq('idempotenz_schluessel', idempotenzSchluessel)
        .single();

      if (existingRun) {
        results.push({
          agency_id: agencyId,
          status: 'übersprungen',
          billing_run_id: existingRun.id,
          error: `Bereits vorhanden (Status: ${existingRun.status})`,
        });
        continue;
      }

      // Calculate amounts
      const betragNetto = Number(plan.betrag_netto);
      const ustSatz = Number(plan.ust_satz);
      const ustBetrag = Math.round(betragNetto * (ustSatz / 100) * 100) / 100;
      const betragBrutto = Math.round((betragNetto + ustBetrag) * 100) / 100;

      // Create billing run record
      const { data: billingRun, error: runError } = await admin
        .from('billing_runs')
        .insert({
          agency_id: agencyId,
          plan_id,
          periode,
          idempotenz_schluessel: idempotenzSchluessel,
          betrag_netto: betragNetto,
          betrag_brutto: betragBrutto,
          ust_betrag: ustBetrag,
          status: 'offen',
        })
        .select()
        .single();

      if (runError || !billingRun) {
        results.push({ agency_id: agencyId, status: 'fehler', error: `Billing-Run konnte nicht erstellt werden: ${runError?.message}` });
        continue;
      }

      // Fetch agency data for Lexware invoice
      const { data: agency } = await admin
        .from('agencies')
        .select('*')
        .eq('id', agencyId)
        .single();

      if (!agency) {
        await admin
          .from('billing_runs')
          .update({ status: 'fehlgeschlagen', fehlergrund: 'Agentur nicht gefunden' })
          .eq('id', billingRun.id);
        results.push({ agency_id: agencyId, status: 'fehler', billing_run_id: billingRun.id, error: 'Agentur nicht gefunden' });
        continue;
      }

      // Calculate due date
      const faelligkeitstag = plan.faelligkeitstag || 1;
      const [periodeYear, periodeMonth] = periode.split('-').map(Number);
      const dueDate = new Date(periodeYear, periodeMonth - 1, faelligkeitstag);
      const faelligkeitsdatum = dueDate.toISOString().split('T')[0];

      // Determine description
      const typLabel = plan.typ === 'setup' ? 'Setup-Gebühr' : 'Retainer';
      const beschreibung = `${typLabel} ${periode} — ${agency.name}`;

      // Step 1: Create invoice in Lexware Office
      let lexInvoiceId: string | null = null;
      let lexInvoiceNumber: string | null = null;

      try {
        // Check if agency has a Lexware contact ID stored
        // For now we use the agency name to create/find contact
        const contactId = (agency as Record<string, unknown>).lex_contact_id as string | undefined;

        if (!contactId) {
          await admin
            .from('billing_runs')
            .update({
              status: 'fehlgeschlagen',
              fehlergrund: 'Kein Lexware-Kontakt für diese Agentur hinterlegt. Bitte zuerst Kontakt anlegen.',
              versuche: (billingRun.versuche || 0) + 1,
            })
            .eq('id', billingRun.id);
          results.push({ agency_id: agencyId, status: 'fehler', billing_run_id: billingRun.id, error: 'Kein Lexware-Kontakt hinterlegt' });
          continue;
        }

        const invoiceResult = await createInvoice(admin, {
          contactId,
          agency_id: agencyId,
          betrag_netto: betragNetto,
          ust_satz: ustSatz,
          beschreibung,
          faelligkeitsdatum,
          idempotenz_schluessel: idempotenzSchluessel,
        });

        lexInvoiceId = invoiceResult.id;
        lexInvoiceNumber = invoiceResult.invoiceNumber;

        await admin
          .from('billing_runs')
          .update({
            lex_invoice_id: lexInvoiceId,
            lex_invoice_number: lexInvoiceNumber,
            status: 'rechnung_erstellt',
          })
          .eq('id', billingRun.id);
      } catch (error) {
        await admin
          .from('billing_runs')
          .update({
            status: 'fehlgeschlagen',
            fehlergrund: `Lexware Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`,
            versuche: (billingRun.versuche || 0) + 1,
          })
          .eq('id', billingRun.id);
        results.push({ agency_id: agencyId, status: 'fehler', billing_run_id: billingRun.id, error: `Lexware Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}` });
        continue;
      }

      // Step 2: If mandate exists and is valid, trigger Mollie payment
      const { data: mandate } = await admin
        .from('mandates')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('status', 'gueltig')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (mandate?.provider_customer_id && mandate?.provider_mandate_id) {
        try {
          const molliePaymentId = await createRecurringPayment(admin, {
            customerId: mandate.provider_customer_id,
            mandateId: mandate.provider_mandate_id,
            amount: betragBrutto,
            description: `${beschreibung} (${lexInvoiceNumber || billingRun.id})`,
            webhookUrl: `${baseUrl}/api/webhooks/mollie`,
            agency_id: agencyId,
            idempotency_key: idempotenzSchluessel,
          });

          await admin
            .from('billing_runs')
            .update({
              mollie_payment_id: molliePaymentId,
              status: 'zahlung_angestossen',
            })
            .eq('id', billingRun.id);

          results.push({ agency_id: agencyId, status: 'zahlung_angestossen', billing_run_id: billingRun.id });
        } catch (error) {
          // Invoice was created but payment failed
          await logApiCall(
            admin,
            'mollie',
            'response',
            '/payments',
            'POST',
            null,
            { error: error instanceof Error ? error.message : 'Unbekannt' },
            agencyId,
            true
          );

          results.push({
            agency_id: agencyId,
            status: 'rechnung_erstellt',
            billing_run_id: billingRun.id,
            error: `Rechnung erstellt, aber Mollie-Zahlung fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannt'}`,
          });
        }
      } else {
        // No valid mandate — invoice created, payment must be handled manually
        results.push({
          agency_id: agencyId,
          status: 'rechnung_erstellt',
          billing_run_id: billingRun.id,
          error: 'Kein gültiges SEPA-Mandat. Zahlung muss manuell erfolgen.',
        });
      }
    } catch (error) {
      results.push({
        agency_id: agencyId,
        status: 'fehler',
        error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      });
    }
  }

  return NextResponse.json({ results });
}
