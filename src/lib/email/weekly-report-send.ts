import { SupabaseClient } from '@supabase/supabase-js';
import { generateWeeklyReportData } from './weekly-report-data';
import { generateWeeklyReportEmail } from './weekly-report-template';
import { sendWeeklyReportEmail } from './resend';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WeeklyReportResult {
  ok: boolean;
  sent: number;
  skipped: number;
  errors: number;
  details: { agency_id: string; agency_name: string; status: string }[];
}

/**
 * Send weekly report emails to all onboarded agencies.
 * Rate-limited to max 2 emails/second for Resend free tier.
 */
export async function sendWeeklyReports(supabase: SupabaseClient): Promise<WeeklyReportResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';

  // Fetch all agencies that have completed onboarding
  const { data: agencies, error } = await supabase
    .from('agencies')
    .select('id, name, email, contact_name, onboarding_completed')
    .eq('onboarding_completed', true);

  if (error) {
    return { ok: false, sent: 0, skipped: 0, errors: 1, details: [{ agency_id: '', agency_name: '', status: error.message }] };
  }

  const result: WeeklyReportResult = { ok: true, sent: 0, skipped: 0, errors: 0, details: [] };

  for (const agency of agencies ?? []) {
    // Find the agency owner's email
    const { data: owner } = await supabase
      .from('users')
      .select('email')
      .eq('agency_id', agency.id)
      .eq('role', 'agency_owner')
      .limit(1)
      .single();

    const recipientEmail = owner?.email ?? agency.email;

    if (!recipientEmail) {
      result.skipped++;
      result.details.push({ agency_id: agency.id, agency_name: agency.name, status: 'no_email' });
      continue;
    }

    try {
      const data = await generateWeeklyReportData(supabase, agency.id);
      const html = generateWeeklyReportEmail({
        ...data,
        dashboard_url: `${appUrl}/dashboard`,
      });

      await sendWeeklyReportEmail(recipientEmail, data.kw, html);
      result.sent++;
      result.details.push({ agency_id: agency.id, agency_name: agency.name, status: 'sent' });

      // Rate limit: max 2/sec → wait 500ms between sends
      await sleep(500);
    } catch (err) {
      result.errors++;
      result.details.push({
        agency_id: agency.id,
        agency_name: agency.name,
        status: `error: ${err instanceof Error ? err.message : 'unknown'}`,
      });
    }
  }

  return result;
}
