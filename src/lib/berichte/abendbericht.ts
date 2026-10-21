/**
 * Abendbericht (20 Uhr Berlin) für Marketing und Sales in Slack – Tag, Woche bis heute, Monat bis heute.
 * Jeder Tag landet zusätzlich in kennzahlen_tage (bereich 'marketing' / 'sales'). Bei jedem Lauf werden
 * Monat und Woche komplett neu berechnet, damit nachträglich gepflegte Daten (z. B. No-Show am Folgetag) stimmen.
 * Nur Mo–Fr (am Wochenende kein Slack-Post; die Wochenendtage rechnet der Montagslauf nach).
 * Freitags gilt die Nachricht als Wochenbericht, am letzten Werktag des Monats als Monatsbericht.
 *
 * Ausgelöst über den Minuten-Tick: ab 20 Uhr wird Mo–Fr einmal pro Tag der Job 'berichte.abend' geplant (dedupe je Tag).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { metaAdAccountId, metaAdsToken } from '@/lib/meta/ad-account';
import { quoten, type Tageszeile } from '@/lib/sales-controlling/tagesbericht';
import { ladeTagesbericht, tageZwischen } from '@/lib/sales-controlling/tagesbericht-laden';
import { META_FILTER } from '@/lib/sales-controlling/quellen';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';
import { berlinTag } from '@/lib/zeit/berlin';
import { slackKanal } from '@/lib/slack/kanaele';
import { ZIEL } from '@/lib/sales-controlling/laden';

export const ABEND_STUNDE = 20;
const TAG = 864e5;

export interface MarketingTag {
  ausgaben: number;
  impressionen: number;
  klicks: number;
  linkKlicks: number;
  metaLeads: number;
  eintragungen: number;
  direktGebucht: number;
}

type SalesTag = Omit<Tageszeile, 'tag'>;

const LEER_MARKETING: MarketingTag = { ausgaben: 0, impressionen: 0, klicks: 0, linkKlicks: 0, metaLeads: 0, eintragungen: 0, direktGebucht: 0 };

function berlinStunde(jetzt: Date): number {
  const teil = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).formatToParts(jetzt).find((x) => x.type === 'hour');
  return Number(teil?.value ?? 0);
}

export const plusTage = (tag: string, n: number) => new Date(new Date(`${tag}T12:00:00Z`).getTime() + n * TAG).toISOString().slice(0, 10);
export const wochenStart = (tag: string) => plusTage(tag, -((new Date(`${tag}T12:00:00Z`).getUTCDay() + 6) % 7));
export const monatsStart = (tag: string) => `${tag.slice(0, 8)}01`;

const wochentag = (tag: string) => new Date(`${tag}T12:00:00Z`).getUTCDay();
export const istWerktag = (tag: string) => wochentag(tag) !== 0 && wochentag(tag) !== 6;

/** Letzter Werktag (Mo–Fr) des Monats von `tag` */
export function letzterWerktag(tag: string): string {
  let t = plusTage(`${tag.slice(0, 7)}-01`, 40).slice(0, 7) + '-01';
  t = plusTage(t, -1);
  while (!istWerktag(t)) t = plusTage(t, -1);
  return t;
}

/** Tick: ab 20 Uhr Mo–Fr einmal täglich den Abendbericht einplanen */
export async function planeAbendbericht(svc: SupabaseClient, jetzt: Date = new Date()): Promise<void> {
  if (berlinStunde(jetzt) < ABEND_STUNDE) return;
  const tag = berlinTag(jetzt);
  if (!istWerktag(tag)) return;
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'berichte.abend',
    run_at: jetzt.toISOString(),
    payload: { tag },
    status: 'pending',
    dedupe_key: `berichte.abend:${tag}`,
  });
  if (error && error.code !== '23505') console.error('[abendbericht] nicht geplant:', error.message);
}

/* ── Daten ─────────────────────────────────────────────────────── */

interface MetaTagRoh {
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

/** Meta Ads je Tag (Sales-Werbekonto, gleiche Filter wie im Sales-Controlling) */
async function ladeMetaTage(von: string, bis: string): Promise<Map<string, Omit<MarketingTag, 'eintragungen' | 'direktGebucht'>> | null> {
  const token = metaAdsToken();
  const account = metaAdAccountId();
  if (!token || !account) return null;
  const url = new URL(`https://graph.facebook.com/v21.0/${account}/insights`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('level', 'account');
  url.searchParams.set('fields', 'spend,impressions,clicks,inline_link_clicks,actions');
  url.searchParams.set('filtering', META_FILTER);
  url.searchParams.set('time_increment', '1');
  url.searchParams.set('time_range', JSON.stringify({ since: von, until: bis }));
  url.searchParams.set('limit', '100');
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Meta ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = ((await res.json()) as { data?: MetaTagRoh[] }).data ?? [];
  return new Map(
    rows.map((r) => {
      const lead = (r.actions ?? []).find((a) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
      return [
        r.date_start,
        {
          ausgaben: Number(r.spend ?? 0),
          impressionen: Number(r.impressions ?? 0),
          klicks: Number(r.clicks ?? 0),
          linkKlicks: Number(r.inline_link_clicks ?? 0),
          metaLeads: lead ? Number(lead.value) : 0,
        },
      ];
    }),
  );
}

/** Kennzahlen für Monat + Woche bis `tag` berechnen und in kennzahlen_tage speichern */
export async function erfasseKennzahlen(svc: SupabaseClient, tag: string) {
  const von = [monatsStart(tag), wochenStart(tag)].sort()[0];
  const tage = tageZwischen(von, tag);
  const [sales, meta] = await Promise.all([
    ladeTagesbericht(tage),
    ladeMetaTage(von, tag).catch((err) => (console.error('[abendbericht] Meta', err), null)),
  ]);

  const marketing = new Map<string, MarketingTag>();
  const salesTage = new Map<string, SalesTag>();
  for (const z of sales.tage) {
    const { tag: t, quoten: _q, ...werte } = z;
    void _q;
    salesTage.set(t, werte);
    marketing.set(t, { ...LEER_MARKETING, ...(meta?.get(t) ?? {}), eintragungen: z.eintragungen, direktGebucht: z.direktGebucht });
  }

  const jetzt = new Date().toISOString();
  const zeilen = [
    ...[...salesTage].map(([t, werte]) => ({ tag: t, bereich: 'sales', werte, aktualisiert_am: jetzt })),
    // Ohne Meta-Verbindung keine Marketing-Ausgaben überschreiben
    ...(meta ? [...marketing].map(([t, werte]) => ({ tag: t, bereich: 'marketing', werte, aktualisiert_am: jetzt })) : []),
  ];
  const { error } = await svc.from('kennzahlen_tage').upsert(zeilen, { onConflict: 'tag,bereich' });
  if (error) throw new Error(`Kennzahlen nicht gespeichert: ${error.message}`);

  return { marketing, sales: salesTage, metaVerbunden: meta !== null, protokolleVerbunden: sales.protokolleVerbunden };
}

/* ── Summen & Texte ────────────────────────────────────────────── */

export function summiere<T extends object>(werte: T[], leer: T): T {
  const s = { ...leer } as Record<string, number>;
  for (const w of werte) for (const [k, v] of Object.entries(w)) if (typeof v === 'number') s[k] = (s[k] ?? 0) + v;
  return s as T;
}

export const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: n < 100 ? 2 : 0 });
const z = (n: number) => n.toLocaleString('de-DE');
const p = (n: number | null) => (n === null ? '–' : `${n.toLocaleString('de-DE')} %`);
const teilen = (a: number, b: number) => (b > 0 ? a / b : null);

/** Marketing als Slack-Felder (je Feld: fette Überschrift mit Emoji, darunter die Werte) */
export function marketingFelder(m: MarketingTag): string[] {
  const cpl = teilen(m.ausgaben, m.eintragungen || m.metaLeads);
  const ctr = teilen(m.linkKlicks, m.impressionen);
  const cpc = teilen(m.ausgaben, m.linkKlicks);
  const cpm = teilen(m.ausgaben * 1000, m.impressionen);
  return [
    `*💸 Ausgaben*\n${eur(m.ausgaben)}`,
    `*🧲 Leads*\n${z(m.eintragungen)} (Meta: ${z(m.metaLeads)})`,
    `*🎯 Kosten pro Lead*\n${cpl === null ? '–' : eur(cpl)}`,
    `*⚡ Direkt gebucht*\n${p(quoten({ ...LEER_SALES, eintragungen: m.eintragungen, direktGebucht: m.direktGebucht }).direktQuote)}`,
    `*👀 Reichweite*\n${z(m.impressionen)} Impressionen · CPM ${cpm === null ? '–' : eur(cpm)}`,
    `*🖱️ Klicks*\n${z(m.linkKlicks)} · CTR ${ctr === null ? '–' : p(Math.round(ctr * 1000) / 10)} · CPC ${cpc === null ? '–' : eur(cpc)}`,
  ];
}

const LEER_SALES: SalesTag = {
  anwahlen: 0,
  gespraeche: 0,
  entscheider: 0,
  protokolleFehlen: 0,
  settingsGebucht: 0,
  settingsGehalten: 0,
  settingsNoShow: 0,
  settingsUnqualifiziert: 0,
  closingsGebucht: 0,
  closingsGehalten: 0,
  closingsNoShow: 0,
  abschluesse: 0,
  volumen: 0,
  eintragungen: 0,
  direktGebucht: 0,
};
export { LEER_SALES, LEER_MARKETING };

/** Sales als Slack-Felder: Ergebnis zuerst, dann Closing, Setting, Telefonie */
export function salesFelder(s: SalesTag): string[] {
  const q = quoten(s);
  return [
    `*🏆 Abschlüsse*\n${z(s.abschluesse)} · ${eur(s.volumen)}`,
    `*📈 Closing-Rate*\n${p(q.closingRate)}`,
    `*🤝 Closings*\n${z(s.closingsGehalten)} geführt · ${z(s.closingsNoShow)} No-Show\nShow-up ${p(q.showUpClosing)}`,
    `*🗓️ Settings*\n${z(s.settingsGehalten)} geführt · ${z(s.settingsNoShow)} No-Show\nShow-up ${p(q.showUpSetting)}`,
    `*➕ Neu gebucht*\n${z(s.settingsGebucht)} Settings · ${z(s.closingsGebucht)} Closings\nQuali-Rate ${p(q.qualifizierung)}`,
    `*📞 Telefonie*\n${z(s.anwahlen)} Anwahlen · ${z(s.gespraeche)} Gespräche`,
  ];
}

/** Hinweise unter einem Zeitraum (nur wenn etwas auffällt) */
export function salesHinweise(s: SalesTag): string[] {
  const h: string[] = [];
  if (s.protokolleFehlen) h.push(`⚠️ ${z(s.protokolleFehlen)} Protokoll${s.protokolleFehlen === 1 ? '' : 'e'} fehlen in Close`);
  if (s.settingsUnqualifiziert) h.push(`🚫 ${z(s.settingsUnqualifiziert)} unqualifiziert`);
  return h;
}

export function fortschrittsBalken(anteil: number, breite = 10): string {
  const voll = Math.max(0, Math.min(breite, Math.round(anteil * breite)));
  return '▰'.repeat(voll) + '▱'.repeat(breite - voll);
}

interface Abschnitt {
  titel: string;
  felder: string[];
  hinweise?: string[];
}

export function baueBlocks(titel: string, abschnitte_: Abschnitt[], fuss: string): unknown[] {
  const blocks: unknown[] = [{ type: 'header', text: { type: 'plain_text', text: titel, emoji: true } }];
  abschnitte_.forEach((a, i) => {
    if (i > 0) blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: a.titel } });
    // Slack erlaubt max. 10 Felder je Abschnitt
    for (let j = 0; j < a.felder.length; j += 10) blocks.push({ type: 'section', fields: a.felder.slice(j, j + 10).map((f) => ({ type: 'mrkdwn', text: f })) });
    if (a.hinweise?.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: a.hinweise.join('   ') }] });
  });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: fuss }] });
  return blocks;
}

async function postSlack(channel: string, blocks: unknown[], text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error('SLACK_BOT_TOKEN fehlt');
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, blocks, text }),
  });
  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) throw new Error(`Slack (${channel}): ${data.error ?? res.status}`);
}

const kurzDatum = (tag: string) => new Date(`${tag}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });

/** Job 'berichte.abend': Kennzahlen speichern und Marketing + Sales nach Slack schicken (nur Mo–Fr) */
export async function sendeAbendbericht(svc: SupabaseClient, tag: string): Promise<void> {
  const d = await erfasseKennzahlen(svc, tag);
  // Verspäteter Job am Wochenende: Kennzahlen sind gespeichert, aber kein Slack-Post
  if (!istWerktag(tag) || !istWerktag(berlinTag())) return;
  const woche = tageZwischen(wochenStart(tag), tag);
  const monat = tageZwischen(monatsStart(tag), tag);
  const istWochenbericht = wochentag(tag) === 5;
  const istMonatsbericht = letzterWerktag(tag) === tag;

  const datum = kurzDatum(tag);
  const monatName = new Date(`${tag}T12:00:00Z`).toLocaleDateString('de-DE', { month: 'long', timeZone: 'UTC' });
  const art = [istWochenbericht && '📅 Wochenbericht', istMonatsbericht && '🗓️ Monatsbericht'].filter(Boolean).join(' & ');
  const zusatz = art ? ` · ${art}` : '';
  const zeitraeume = [
    { titel: `📍 *Heute* (${datum})`, tage: [tag] },
    { titel: `📆 *Woche* (seit ${kurzDatum(woche[0] ?? tag)})`, tage: woche },
    { titel: `🗓️ *${monatName}* bis heute`, tage: monat },
  ];

  const fehler: string[] = [];
  const marketingKanal = await slackKanal('marketing');
  if (marketingKanal) {
    const teile: Abschnitt[] = d.metaVerbunden
      ? zeitraeume.map((x) => ({ titel: x.titel, felder: marketingFelder(summiere(x.tage.map((t) => d.marketing.get(t) ?? LEER_MARKETING), LEER_MARKETING)) }))
      : [{ titel: '⚠️ *Meta Ads nicht verbunden*', felder: ['META_SYSTEM_USER_TOKEN (ads_read) fehlt oder ist ungültig.'] }];
    const fuss = '🔗 <https://cloud.zoeppmedia.de/admin/marketing|Meta Ads> · Zahlen aus Meta Ads und den Funnel-Eintragungen';
    await postSlack(marketingKanal, baueBlocks(`📣 Marketing · ${datum}${zusatz}`, teile, fuss), `Marketing ${datum}`).catch((e) => fehler.push(String(e)));
  }

  const salesKanal = await slackKanal('sales');
  if (salesKanal) {
    const teile: Abschnitt[] = zeitraeume.map((x) => {
      const summe = summiere(x.tage.map((t) => d.sales.get(t) ?? LEER_SALES), LEER_SALES);
      return { titel: x.titel, felder: salesFelder(summe), hinweise: salesHinweise(summe) };
    });
    // Monatsziel unter dem Monat
    const monatSumme = summiere(monat.map((t) => d.sales.get(t) ?? LEER_SALES), LEER_SALES);
    const anteil = monatSumme.volumen / ZIEL;
    teile[2].hinweise = [`🎯 Monatsziel ${eur(ZIEL)}: ${fortschrittsBalken(anteil)} ${Math.round(anteil * 100)} %`, ...(teile[2].hinweise ?? [])];
    const fuss = '🔗 <https://cloud.zoeppmedia.de/admin/vertrieb|Sales-Controlling> · Zahlen aus Close';
    await postSlack(salesKanal, baueBlocks(`💼 Sales · ${datum}${zusatz}`, teile, fuss), `Sales ${datum}`).catch((e) => fehler.push(String(e)));
  }

  // Kein Retry bei Slack-Fehlern: sonst ginge der andere Bericht mehrfach raus. Kennzahlen sind gespeichert.
  if (fehler.length) console.error('[abendbericht] Slack-Versand fehlgeschlagen:', fehler.join(' | '));
}
