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

/** Diagnose: Welcher Bot steckt hinter SLACK_BOT_TOKEN, und welche Kanäle sieht er? (ohne Token-Ausgabe) */
export async function slackDiagnose(): Promise<Record<string, unknown>> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { fehler: 'SLACK_BOT_TOKEN fehlt' };
  const get = async (methode: string, params = '') => {
    const res = await fetch(`https://slack.com/api/${methode}${params}`, { headers: { Authorization: `Bearer ${token}` } });
    return (await res.json()) as Record<string, unknown>;
  };
  const auth = await get('auth.test');
  const kanaele = await get('users.conversations', '?types=public_channel,private_channel&limit=200&exclude_archived=true');
  return {
    team: auth.team,
    team_id: auth.team_id,
    bot_user: auth.user,
    bot_id: auth.bot_id,
    ok: auth.ok,
    fehler: auth.error ?? kanaele.error ?? null,
    mitglied_in: ((kanaele.channels as Array<{ id: string; name: string; is_private: boolean }> | undefined) ?? []).map((c) => `${c.name} (${c.id}${c.is_private ? ', privat' : ''})`),
  };
}
