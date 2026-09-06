import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { recordPayment, logApiCall } from '@/lib/billing/lexoffice';
import { getCheckoutSession } from '@/lib/billing/stripe';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify Stripe webhook signature (stripe-signature header).
 * Format: t=<timestamp>,v1=<hmac>,v1=<hmac>...
 * signed_payload = `${timestamp}.${rawBody}`, HMAC-SHA256 with webhook secret.
 */
function verifyStripeSignature(payload: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader) return false;

  const parts: Record<string, string[]> = {};
  for (const part of sigHeader.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    (parts[key] ??= []).push(value);
  }

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 ?? [];
  if (!timestamp || signatures.length === 0) return false;

  // Replay-Schutz: Event darf max. 5 Minuten alt sein
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const expectedBuf = Buffer.from(expected);

  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  let eventType: string | null = null;

  try {
    const rawBody = await request.text();

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      await logApiCall(supabase, 'stripe', 'webhook', '/webhooks/stripe', 'POST', 500, { error: 'STRIPE_WEBHOOK_SECRET nicht konfiguriert — Webhook abgelehnt' }, null, true);
      return NextResponse.json({ error: 'Webhook nicht konfiguriert' }, { status: 500 });
    }

    if (!verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), webhookSecret)) {
      await logApiCall(supabase, 'stripe', 'webhook', '/webhooks/stripe', 'POST', 400, { error: 'Ungültige Webhook-Signatur' }, null, true);
      return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 400 });
    }

    const body = JSON.parse(rawBody);
    eventType = (body.type as string) ?? null;
    const eventData = body.data?.object as Record<string, unknown> | undefined;

    // Log incoming webhook
    await logApiCall(
      supabase,
      'stripe',
      'webhook',
      '/webhooks/stripe',
      'POST',
      null,
      { type: eventType, id: body.id },
      null,
      false
    );

    if (!eventData) {
      await logApiCall(supabase, 'stripe', 'webhook', '/webhooks/stripe', 'POST', 400, { error: 'Kein Event-Objekt erhalten' }, null, true);
      return NextResponse.json({ error: 'Kein Event-Objekt erhalten' }, { status: 400 });
    }

    switch (eventType) {
      // -----------------------------------------------------------------
      // SEPA mandate setup via Checkout Session
      // -----------------------------------------------------------------
      case 'checkout.session.completed': {
        const sessionId = eventData.id as string;
        const customerId = eventData.customer as string | undefined;
        const metadata = eventData.metadata as Record<string, string> | undefined;
        const agencyId = metadata?.agency_id ?? null;

        // Fetch the full session with expanded setup_intent to get payment method
        const session = await getCheckoutSession(supabase, sessionId);
        const setupIntent = session.setup_intent as Record<string, unknown> | undefined;
        const paymentMethodId = setupIntent?.payment_method as string | undefined;

        if (customerId && paymentMethodId) {
          await supabase
            .from('mandates')
            .update({
              status: 'gueltig',
              provider_mandate_id: paymentMethodId,
              erteilt_am: new Date().toISOString(),
              letzte_pruefung: new Date().toISOString(),
            })
            .eq('provider_customer_id', customerId)
            .eq('status', 'angefragt');

          await logApiCall(
            supabase,
            'stripe',
            'webhook',
            '/webhooks/stripe',
            'POST',
            null,
            { info: 'SEPA-Mandat aktiviert via Checkout', customerId, paymentMethodId },
            agencyId,
            false
          );
        }
        break;
      }

      // -----------------------------------------------------------------
      // SEPA setup via Setup Intent (alternative to Checkout)
      // -----------------------------------------------------------------
      case 'setup_intent.succeeded': {
        const customerId = eventData.customer as string | undefined;
        const paymentMethodId = eventData.payment_method as string | undefined;
        const metadata = eventData.metadata as Record<string, string> | undefined;
        const agencyId = metadata?.agency_id ?? null;

        if (customerId && paymentMethodId) {
          await supabase
            .from('mandates')
            .update({
              status: 'gueltig',
              provider_mandate_id: paymentMethodId,
              erteilt_am: new Date().toISOString(),
              letzte_pruefung: new Date().toISOString(),
            })
            .eq('provider_customer_id', customerId)
            .eq('status', 'angefragt');

          await logApiCall(
            supabase,
            'stripe',
            'webhook',
            '/webhooks/stripe',
            'POST',
            null,
            { info: 'SEPA-Mandat aktiviert via SetupIntent', customerId, paymentMethodId },
            agencyId,
            false
          );
        }
        break;
      }

      // -----------------------------------------------------------------
      // Payment succeeded — update billing run + record in Lexware
      // -----------------------------------------------------------------
      case 'payment_intent.succeeded': {
        const paymentIntentId = eventData.id as string;
        const metadata = eventData.metadata as Record<string, string> | undefined;
        const agencyId = metadata?.agency_id ?? null;
        const lexInvoiceId = metadata?.lex_invoice_id ?? null;

        // Find billing run by stripe_payment_id
        const { data: billingRun } = await supabase
          .from('billing_runs')
          .select('*')
          .eq('stripe_payment_id', paymentIntentId)
          .single();

        if (billingRun) {
          const now = new Date().toISOString();

          await supabase
            .from('billing_runs')
            .update({
              status: 'bezahlt',
              bezahlt_am: now,
            })
            .eq('id', billingRun.id);

          // Record payment in Lexware Office if invoice exists
          const invoiceId = lexInvoiceId || billingRun.lex_invoice_id;
          if (invoiceId) {
            try {
              await recordPayment(supabase, invoiceId, {
                betrag: Number(billingRun.betrag_brutto),
                datum: now.split('T')[0],
                zahlungsart: 'bankTransfer',
              });
            } catch {
              // Payment recording in Lexware is best-effort
              await logApiCall(
                supabase,
                'stripe',
                'webhook',
                '/webhooks/stripe',
                'POST',
                null,
                { warnung: 'Lexware Zahlungsbuchung fehlgeschlagen', paymentIntentId, invoiceId },
                agencyId,
                true
              );
            }
          }

          await logApiCall(
            supabase,
            'stripe',
            'webhook',
            '/webhooks/stripe',
            'POST',
            null,
            { info: 'Zahlung erfolgreich', paymentIntentId, billing_run_id: billingRun.id },
            agencyId,
            false
          );
        } else {
          await logApiCall(
            supabase,
            'stripe',
            'webhook',
            '/webhooks/stripe',
            'POST',
            null,
            { warnung: 'Kein billing_run für PaymentIntent gefunden', paymentIntentId },
            agencyId,
            false
          );
        }
        break;
      }

      // -----------------------------------------------------------------
      // Payment failed — update billing run + log error
      // -----------------------------------------------------------------
      case 'payment_intent.payment_failed': {
        const paymentIntentId = eventData.id as string;
        const metadata = eventData.metadata as Record<string, string> | undefined;
        const agencyId = metadata?.agency_id ?? null;
        const lastError = eventData.last_payment_error as Record<string, unknown> | undefined;
        const errorMessage = (lastError?.message as string) ?? 'Unbekannter Fehler';

        const { data: billingRun } = await supabase
          .from('billing_runs')
          .select('*')
          .eq('stripe_payment_id', paymentIntentId)
          .single();

        if (billingRun) {
          await supabase
            .from('billing_runs')
            .update({
              status: 'fehlgeschlagen',
              fehlergrund: `Stripe Zahlung fehlgeschlagen: ${errorMessage}`,
              versuche: (billingRun.versuche || 0) + 1,
            })
            .eq('id', billingRun.id);
        }

        await logApiCall(
          supabase,
          'stripe',
          'webhook',
          '/webhooks/stripe',
          'POST',
          null,
          {
            error: `Zahlung fehlgeschlagen: ${errorMessage}`,
            paymentIntentId,
            agency_id: agencyId,
            billing_run_id: billingRun?.id ?? null,
          },
          agencyId,
          true
        );
        break;
      }

      default: {
        // Unknown event type — log for debugging
        await logApiCall(
          supabase,
          'stripe',
          'webhook',
          '/webhooks/stripe',
          'POST',
          null,
          { info: 'Unbekannter Event-Typ', eventType },
          null,
          false
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    await logApiCall(
      supabase,
      'stripe',
      'webhook',
      '/webhooks/stripe',
      'POST',
      500,
      { error: error instanceof Error ? error.message : 'Unbekannter Fehler', eventType },
      null,
      true
    );

    return NextResponse.json({ error: 'Webhook-Verarbeitung fehlgeschlagen' }, { status: 500 });
  }
}
