import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { logApiCall } from '@/lib/billing/lexoffice';

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const body = await request.json();

    // Log incoming webhook
    await logApiCall(
      supabase,
      'lexoffice',
      'webhook',
      '/webhooks/lexoffice',
      'POST',
      null,
      body,
      null,
      false
    );

    const eventType = body?.eventType as string | undefined;

    if (eventType === 'invoice.status.changed') {
      const resourceId = body?.resourceId as string | undefined;
      const newStatus = body?.status as string | undefined;

      if (resourceId) {
        // Find billing run with this Lexware invoice ID
        const { data: billingRun } = await supabase
          .from('billing_runs')
          .select('*')
          .eq('lex_invoice_id', resourceId)
          .single();

        if (billingRun) {
          await logApiCall(
            supabase,
            'lexoffice',
            'webhook',
            '/webhooks/lexoffice',
            'POST',
            null,
            {
              info: 'Rechnungsstatus geändert',
              invoice_id: resourceId,
              new_status: newStatus,
              billing_run_id: billingRun.id,
            },
            billingRun.agency_id,
            false
          );

          // If Lexware reports the invoice as paid (e.g. via manual booking)
          if (newStatus === 'paid' && billingRun.status !== 'bezahlt') {
            await supabase
              .from('billing_runs')
              .update({
                status: 'bezahlt',
                bezahlt_am: new Date().toISOString(),
              })
              .eq('id', billingRun.id);
          }

          // If Lexware reports cancellation
          if (newStatus === 'voided' || newStatus === 'cancelled') {
            await supabase
              .from('billing_runs')
              .update({
                status: 'storniert',
                fehlergrund: `Lexware Status: ${newStatus}`,
              })
              .eq('id', billingRun.id);
          }
        }
      }
    } else if (eventType === 'token.revoked') {
      // API token was revoked — log critical warning
      await logApiCall(
        supabase,
        'lexoffice',
        'webhook',
        '/webhooks/lexoffice',
        'POST',
        null,
        {
          warnung: 'Lexware Office API-Token wurde widerrufen! Alle Abrechnungsfunktionen sind deaktiviert.',
          eventType,
        },
        null,
        true
      );
    } else {
      // Unknown event type — log for debugging
      await logApiCall(
        supabase,
        'lexoffice',
        'webhook',
        '/webhooks/lexoffice',
        'POST',
        null,
        { info: 'Unbekannter Event-Typ', eventType, body },
        null,
        false
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    await logApiCall(
      supabase,
      'lexoffice',
      'webhook',
      '/webhooks/lexoffice',
      'POST',
      500,
      { error: error instanceof Error ? error.message : 'Unbekannter Fehler' },
      null,
      true
    );

    return NextResponse.json({ error: 'Webhook-Verarbeitung fehlgeschlagen' }, { status: 500 });
  }
}
