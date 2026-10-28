/**
 * Betriebsalarme nach Slack: Kanal „system“ (slack_kanal_system / SLACK_SYSTEM_CHANNEL),
 * ohne Kanal als Direktnachricht an Felix. Nur intern – nie an Kunden oder Bewerber.
 *
 * Gedrosselt über system_alarme: ein offener Alarm wird höchstens alle 2 h (kritisch: 1 h) erneut gemeldet,
 * beim Schließen kommt einmal „wieder OK“.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { slackKanal } from '@/lib/slack/kanaele';

/** Felix in Slack (wie FELIX_SLACK_ID in lib/sales/report) */
const FELIX_SLACK_ID = 'U09EK5NAR4P';

export type Schwere = 'kritisch' | 'warnung';

export interface Alarm {
  /** Eindeutiger Schlüssel, z. B. 'sonde:inbox' – derselbe Schlüssel = derselbe Alarm */
  schluessel: string;
  titel: string;
  text: string;
  schwere?: Schwere;
  /** Pfad in der Cloud, z. B. '/admin/health' */
  link?: string;
}

const WIEDERHOLEN_MS: Record<Schwere, number> = { kritisch: 3600_000, warnung: 2 * 3600_000 };

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://cloud.zoeppmedia.de').replace(/\/$/, '');
}

/** Slack-Nachricht für einen Alarm bauen (Block Kit) */
export function baueAlarmNachricht(a: Alarm & { anzahl?: number }, behoben = false): { text: string; blocks: unknown[] } {
  const schwere = a.schwere ?? 'warnung';
  const emoji = behoben ? '✅' : schwere === 'kritisch' ? '🚨' : '⚠️';
  const tag = !behoben && schwere === 'kritisch' ? `<@${FELIX_SLACK_ID}> ` : '';
  const kopf = `${tag}${emoji} *${behoben ? `Wieder OK: ${a.titel}` : a.titel}*`;
  const zeilen = [kopf, a.text];
  if (!behoben && a.anzahl && a.anzahl > 1) zeilen.push(`_${a.anzahl}× seit dem ersten Auftreten_`);
  const blocks: unknown[] = [{ type: 'section', text: { type: 'mrkdwn', text: zeilen.join('\n').slice(0, 2900) } }];
  if (a.link && !behoben) {
    blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'In der Cloud öffnen' }, url: `${appUrl()}${a.link}` }] });
  }
  return { text: `${emoji} ${behoben ? 'Wieder OK: ' : ''}${a.titel}: ${a.text}`.slice(0, 3000), blocks };
}

/** Rohe Slack-Nachricht in den System-Kanal (bzw. als DM an Felix). Wirft nie. */
export async function sendeSystemSlack(nachricht: { text: string; blocks?: unknown[] }): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return false;
  try {
    const channel = (await slackKanal('system')) ?? FELIX_SLACK_ID;
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, ...nachricht, unfurl_links: false }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!data.ok) console.error('[system-alarm] Slack:', data.error ?? res.status);
    return !!data.ok;
  } catch (err) {
    console.error('[system-alarm] Slack nicht erreichbar:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Alarm melden (gedrosselt). Gibt true zurück, wenn nach Slack gesendet wurde.
 * Wirft nie – ein Alarm darf den aufrufenden Ablauf nicht stören.
 */
export async function meldeAlarm(svc: SupabaseClient, a: Alarm, jetzt: Date = new Date()): Promise<boolean> {
  const schwere = a.schwere ?? 'warnung';
  try {
    const { data } = await svc.from('system_alarme').select('offen, anzahl, zuletzt_gemeldet_am').eq('schluessel', a.schluessel).maybeSingle();
    const alt = data as { offen: boolean; anzahl: number; zuletzt_gemeldet_am: string | null } | null;
    const anzahl = alt?.offen ? alt.anzahl + 1 : 1;
    const zuletzt = alt?.offen && alt.zuletzt_gemeldet_am ? new Date(alt.zuletzt_gemeldet_am).getTime() : 0;
    const melden = jetzt.getTime() - zuletzt >= WIEDERHOLEN_MS[schwere];

    const zeile: Record<string, unknown> = {
      schluessel: a.schluessel,
      titel: a.titel.slice(0, 200),
      text: a.text.slice(0, 2000),
      schwere,
      offen: true,
      anzahl,
      zuletzt_am: jetzt.toISOString(),
      behoben_am: null,
    };
    if (!alt?.offen) zeile.erstes_am = jetzt.toISOString();
    if (melden) zeile.zuletzt_gemeldet_am = jetzt.toISOString();
    await svc.from('system_alarme').upsert(zeile, { onConflict: 'schluessel' });

    if (!melden) return false;
    return await sendeSystemSlack(baueAlarmNachricht({ ...a, schwere, anzahl }));
  } catch (err) {
    console.error('[system-alarm] nicht gemeldet:', a.schluessel, err instanceof Error ? err.message : err);
    return false;
  }
}

/** Offenen Alarm schließen und einmal „wieder OK“ melden (nur wenn er auch gemeldet war). */
export async function meldeBehoben(svc: SupabaseClient, schluessel: string, jetzt: Date = new Date()): Promise<boolean> {
  try {
    const { data } = await svc.from('system_alarme').select('titel, schwere, zuletzt_gemeldet_am, erstes_am').eq('schluessel', schluessel).eq('offen', true).maybeSingle();
    const alt = data as { titel: string; schwere: Schwere; zuletzt_gemeldet_am: string | null; erstes_am: string } | null;
    if (!alt) return false;
    await svc.from('system_alarme').update({ offen: false, behoben_am: jetzt.toISOString() }).eq('schluessel', schluessel);
    if (!alt.zuletzt_gemeldet_am) return false;
    const minuten = Math.max(1, Math.round((jetzt.getTime() - new Date(alt.erstes_am).getTime()) / 60_000));
    return await sendeSystemSlack(baueAlarmNachricht({ schluessel, titel: alt.titel, text: `Nach ${minuten} Min. behoben.`, schwere: alt.schwere }, true));
  } catch {
    return false;
  }
}
