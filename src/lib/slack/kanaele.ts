/**
 * Slack-Kanäle: zuerst aus system_einstellungen (slack_kanal_sales / _marketing / _fulfillment / _system / _wins),
 * sonst aus den Vercel-Variablen SLACK_SALES_CHANNEL / … / SLACK_WINS_CHANNEL,
 * sonst automatisch: ein Kanal, in dem der Bot Mitglied ist und dessen Name passt (z. B. „04-fulfillment“, „wins“).
 * So reicht es, den Bot in Slack in den Kanal einzuladen – ohne ID-Pflege und ohne Redeploy.
 */
import { createAdminClient } from '@/lib/supabase/admin';

export type SlackBereich = 'sales' | 'marketing' | 'fulfillment' | 'system' | 'wins';

const ENV: Record<SlackBereich, string> = {
  sales: 'SLACK_SALES_CHANNEL',
  marketing: 'SLACK_MARKETING_CHANNEL',
  fulfillment: 'SLACK_FULFILLMENT_CHANNEL',
  system: 'SLACK_SYSTEM_CHANNEL',
  wins: 'SLACK_WINS_CHANNEL',
};

/** Woran ein Kanal für den Bereich am Namen erkannt wird (rein, testbar) */
const NAMEN: Record<SlackBereich, RegExp> = {
  sales: /sales/i,
  marketing: /marketing/i,
  fulfillment: /ful+fil+ment/i,
  system: /system|alarm|monitoring|ops\b/i,
  wins: /wins?\b|erfolge|einstellungen/i,
};

export interface BotKanal {
  id: string;
  name: string;
}

/** Passenden Kanal am Namen finden (rein, testbar) */
export function kanalNachName(bereich: SlackBereich, kanaele: BotKanal[]): string | null {
  return kanaele.find((k) => NAMEN[bereich].test(k.name))?.id ?? null;
}

let botKanaeleCache: { zeit: number; kanaele: BotKanal[] } | null = null;

/** Kanäle, in denen der Bot Mitglied ist (10 Min. zwischengespeichert). Wirft nie. */
export async function botKanaele(): Promise<BotKanal[]> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return [];
  if (botKanaeleCache && Date.now() - botKanaeleCache.zeit < 10 * 60_000) return botKanaeleCache.kanaele;
  try {
    const res = await fetch('https://slack.com/api/users.conversations?types=public_channel,private_channel&limit=200&exclude_archived=true', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as { ok?: boolean; channels?: BotKanal[] };
    const kanaele = data.ok ? (data.channels ?? []).map((c) => ({ id: c.id, name: c.name })) : [];
    botKanaeleCache = { zeit: Date.now(), kanaele };
    return kanaele;
  } catch {
    return [];
  }
}

export async function slackKanal(bereich: SlackBereich): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from('system_einstellungen').select('wert').eq('key', `slack_kanal_${bereich}`).maybeSingle();
    const wert = (data as { wert: string } | null)?.wert?.trim();
    if (wert) return wert;
  } catch {
    /* Fallback auf Vercel */
  }
  const env = process.env[ENV[bereich]]?.trim();
  if (env) return env;
  return kanalNachName(bereich, await botKanaele());
}

/** E-Mail-Adressen, unter denen Felix in Slack zu finden ist */
const FELIX_MAILS = ['felix@zoeppmedia.de', 'felix@zh-digitalisierung.de'];

let felixCache: string | null | undefined;

/**
 * Felix' Slack-ID im Workspace des Bots. Die frühere feste ID stammte aus einem anderen Workspace
 * (→ „channel_not_found“ bei der Direktnachricht, @-Erwähnung ohne Wirkung).
 * Reihenfolge: system_einstellungen slack_felix_id → SLACK_FELIX_ID → Suche per E-Mail (users:read.email). Wirft nie.
 */
export async function felixSlackId(): Promise<string | null> {
  if (felixCache !== undefined) return felixCache;
  try {
    const { data } = await createAdminClient().from('system_einstellungen').select('wert').eq('key', 'slack_felix_id').maybeSingle();
    const wert = (data as { wert: string } | null)?.wert?.trim();
    if (wert) return (felixCache = wert);
  } catch {
    /* weiter */
  }
  if (process.env.SLACK_FELIX_ID?.trim()) return (felixCache = process.env.SLACK_FELIX_ID.trim());
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  for (const mail of FELIX_MAILS) {
    try {
      const res = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(mail)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = (await res.json()) as { ok?: boolean; user?: { id: string } };
      if (data.ok && data.user?.id) {
        await createAdminClient()
          .from('system_einstellungen')
          .upsert({ key: 'slack_felix_id', wert: data.user.id, updated_at: new Date().toISOString() }, { onConflict: 'key' })
          .then(
            () => {},
            () => {},
          );
        return (felixCache = data.user.id);
      }
    } catch {
      /* nächste Adresse */
    }
  }
  // Nicht gefunden: nicht dauerhaft merken, beim nächsten Kaltstart erneut versuchen
  return null;
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
  botKanaeleCache = null;
  const kanaele = await botKanaele();
  const felix = await get('users.lookupByEmail', `?email=${encodeURIComponent(FELIX_MAILS[0])}`);
  const bereiche = Object.fromEntries(await Promise.all((Object.keys(ENV) as SlackBereich[]).map(async (b) => [b, await slackKanal(b)])));
  return {
    team: auth.team,
    team_id: auth.team_id,
    bot_user: auth.user,
    bot_id: auth.bot_id,
    ok: auth.ok,
    fehler: auth.error ?? null,
    mitglied_in: kanaele.map((c) => `${c.name} (${c.id})`),
    kanal_je_bereich: bereiche,
    felix_suche: felix.ok ? 'gefunden' : `nicht gefunden: ${String(felix.error ?? '')}`,
  };
}
