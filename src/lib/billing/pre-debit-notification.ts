import { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const FROM = 'Zoepp Media Cloud <noreply@zoepp-gruppe.de>';

/**
 * Sends a pre-debit notification email to the customer.
 * SEPA requires at least 1 day advance notice before debiting.
 *
 * Called by the daily cron: checks billing_runs with status 'freigegeben'
 * and faellig_am = tomorrow → sends notification and marks as notified.
 */
export async function sendPreDebitNotification(
  supabase: SupabaseClient,
  params: {
    agency_email: string;
    agency_contact_name: string;
    agency_name: string;
    invoice_number: string;
    betrag_brutto: number;
    einzugsdatum: string; // YYYY-MM-DD
    billing_run_id: string;
  }
): Promise<boolean> {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY || '');
    const datumFormatiert = new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(params.einzugsdatum));

    await resend.emails.send({
      from: FROM,
      to: params.agency_email,
      subject: `Vorabankündigung: Einzug am ${datumFormatiert} — ${params.invoice_number}`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #DC2626; padding: 20px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">Zoepp Media Cloud</h1>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #111827; font-size: 16px;">Hallo ${params.agency_contact_name},</p>

            <p style="color: #4b5563;">hiermit informieren wir dich, dass wir den folgenden Betrag per SEPA-Lastschrift einziehen werden:</p>

            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="color: #6b7280; padding: 4px 0; font-size: 14px;">Rechnungsnummer</td>
                  <td style="color: #111827; font-weight: 600; text-align: right; font-size: 14px;">${params.invoice_number}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 4px 0; font-size: 14px;">Betrag</td>
                  <td style="color: #111827; font-weight: 600; text-align: right; font-size: 14px;">${params.betrag_brutto.toFixed(2)} €</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 4px 0; font-size: 14px;">Einzugsdatum</td>
                  <td style="color: #111827; font-weight: 600; text-align: right; font-size: 14px;">${datumFormatiert}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 4px 0; font-size: 14px;">Gläubiger</td>
                  <td style="color: #111827; text-align: right; font-size: 14px;">Zoepp Media UG</td>
                </tr>
              </table>
            </div>

            <p style="color: #4b5563; font-size: 14px;">Bitte stelle sicher, dass dein Konto zum Einzugsdatum ausreichend gedeckt ist.</p>

            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
              Diese Vorabankündigung erfolgt gemäß den Regelungen des SEPA-Lastschriftverfahrens.
              Bei Fragen wende dich an uns unter info@zoeppmedia.de.
            </p>
          </div>
        </div>
      `,
    });

    // Mark as notified
    await supabase
      .from('billing_runs')
      .update({ status: 'vorab_benachrichtigt' })
      .eq('id', params.billing_run_id);

    return true;
  } catch {
    return false;
  }
}

/**
 * Check for billing runs due tomorrow and send pre-debit notifications.
 * Called from the daily cron.
 */
export async function checkPreDebitNotifications(supabase: SupabaseClient): Promise<number> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Find billing runs that are freigegeben and due tomorrow
  // (We use the plan's faelligkeitstag to determine the date)
  const { data: runs } = await supabase
    .from('billing_runs')
    .select('*, agencies:agency_id(name, contact_name, email)')
    .in('status', ['rechnung_erstellt', 'zahlung_angestossen'])
    .eq('freigabe_status', 'freigegeben');

  if (!runs?.length) return 0;

  let sent = 0;
  for (const run of runs) {
    const agency = run.agencies as { name: string; contact_name: string; email: string } | null;
    if (!agency?.email) continue;

    // Check if this run's period matches tomorrow's month
    // and if the faelligkeitstag is tomorrow
    const tomorrowDay = tomorrow.getDate();
    const { data: plan } = await supabase
      .from('billing_plans')
      .select('faelligkeitstag')
      .eq('id', run.plan_id)
      .single();

    if (plan && plan.faelligkeitstag === tomorrowDay) {
      const success = await sendPreDebitNotification(supabase, {
        agency_email: agency.email,
        agency_contact_name: agency.contact_name || agency.name,
        agency_name: agency.name,
        invoice_number: run.lex_invoice_number || run.periode,
        betrag_brutto: Number(run.betrag_brutto),
        einzugsdatum: tomorrowStr,
        billing_run_id: run.id,
      });
      if (success) sent++;
    }
  }

  return sent;
}
