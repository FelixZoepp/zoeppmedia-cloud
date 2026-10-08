/**
 * Slack-Kanäle: zuerst aus system_einstellungen (slack_kanal_sales / slack_kanal_marketing),
 * sonst aus den Vercel-Variablen SLACK_SALES_CHANNEL / SLACK_MARKETING_CHANNEL.
 * So lassen sich Kanäle ohne Redeploy umstellen.
 */
import { createAdminClient } from '@/lib/supabase/admin';

export type SlackBereich = 'sales' | 'marketing';

const ENV: Record<SlackBereich, string> = { sales: 'SLACK_SALES_CHANNEL', marketing: 'SLACK_MARKETING_CHANNEL' };

export async function slackKanal(bereich: SlackBereich): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from('system_einstellungen').select('wert').eq('key', `slack_kanal_${bereich}`).maybeSingle();
    const wert = (data as { wert: string } | null)?.wert?.trim();
    if (wert) return wert;
  } catch {
    /* Fallback auf Vercel */
  }
  return process.env[ENV[bereich]]?.trim() || null;
}
