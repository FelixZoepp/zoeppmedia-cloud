import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { getPayment } from '@/lib/billing/mollie';
import { recordPayment, logApiCall } from '@/lib/billing/lexoffice';

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  let paymentId: string | null = null;

  try {
    // Mollie sends payment ID as form-urlencoded: id=tr_xxxxx
    const formData = await request.formData();
    paymentId = formData.get('id') as string | null;

    if (!paymentId) {
      await logApiCall(supabase, 'mollie', 'webhook', '/webhooks/mollie', 'POST', 400, { error: 'Keine Payment-ID erhalten' }, null, true);
      return NextResponse.json({ error: 'Keine Payment-ID erhalten' }, { status: 400 });
    }

    // Log incoming webhook
    await logApiCall(supabase, 'mollie', 'webhook', '/webhooks/mollie', 'POST', null, { paymentId }, null, false);

    // Fetch payment status from Mollie
    const payment = await getPayment(supabase, paymentId);
    const status = payment.status as string;
    const metadata = payment.metadata as Record<string, unknown> | null;

    // Find the billing run for this payment
    const { data: billingRun } = await supabase
      .from('billing_runs')
      .select('*, billing_plans(*)')
      .eq('mollie_payment_id', paymentId)
      .single();

    if (!billingRun) {
      // Could be a first payment for mandate creation — check mandates
      const customerId = payment.customerId as string | undefined;
      if (customerId && status === 'paid') {
        // Update mandate status to 'gueltig'
        const mandateId = payment.mandateId as string | undefined;
        if (mandateId) {
          await supabase
            .from('mandates')
            .update({
              status: 'gueltig',
              provider_mandate_id: mandateId,
              erteilt_am: new Date().toISOString(),
              letzte_pruefung: new Date().toISOString(),
            })
            .eq('provider_customer_id', customerId);
        }
      } else if (customerId && (status === 'failed' || status === 'expired' || status === 'canceled')) {
        await supabase
          .from('mandates')
          .update({
            status: 'fehlgeschlagen',
            letzte_pruefung: new Date().toISOString(),
          })
          .eq('provider_customer_id', customerId);
      }

      await logApiCall(supabase, 'mollie', 'webhook', '/webhooks/mollie', 'POST', 200, { info: 'Kein billing_run gefunden, Mandat-Update versucht', paymentId, status }, null, false);
      return NextResponse.json({ received: true });
    }

    // Update billing run based on payment status
    if (status === 'paid') {
      const now = new Date().toISOString();

      await supabase
        .from('billing_runs')
        .update({
          status: 'bezahlt',
          bezahlt_am: now,
        })
        .eq('id', billingRun.id);

      // Record payment in Lexware Office if invoice exists
      if (billingRun.lex_invoice_id) {
        try {
          await recordPayment(supabase, billingRun.lex_invoice_id, {
            betrag: Number(billingRun.betrag_brutto),
            datum: now.split('T')[0],
            zahlungsart: 'bankTransfer',
          });
        } catch {
          // Payment recording in Lexware is best-effort
        }
      }
    } else if (status === 'failed' || status === 'expired' || status === 'canceled') {
      await supabase
        .from('billing_runs')
        .update({
          status: 'fehlgeschlagen',
          fehlergrund: `Mollie Status: ${status}`,
          versuche: (billingRun.versuche || 0) + 1,
        })
        .eq('id', billingRun.id);

      await logApiCall(
        supabase,
        'mollie',
        'webhook',
        '/webhooks/mollie',
        'POST',
        null,
        { error: `Zahlung fehlgeschlagen: ${status}`, paymentId, agency_id: billingRun.agency_id },
        billingRun.agency_id,
        true
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    await logApiCall(
      supabase,
      'mollie',
      'webhook',
      '/webhooks/mollie',
      'POST',
      500,
      { error: error instanceof Error ? error.message : 'Unbekannter Fehler', paymentId },
      null,
      true
    );

    return NextResponse.json({ error: 'Webhook-Verarbeitung fehlgeschlagen' }, { status: 500 });
  }
}
