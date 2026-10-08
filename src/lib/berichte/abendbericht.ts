/**
 * Abendbericht (20 Uhr Berlin) für Marketing und Sales in Slack – Tag, Woche bis heute, Monat bis heute.
 * Jeder Tag landet zusätzlich in kennzahlen_tage (bereich 'marketing' / 'sales'). Bei jedem Lauf werden
 * Monat und Woche komplett neu berechnet, damit nachträglich gepflegte Daten (z. B. No-Show am Folgetag) stimmen.
 * Sonntags gilt die Nachricht als Wochenbericht, am Monatsletzten als Monatsbericht.
 *
 * Ausgelöst über den Minuten-Tick: ab 20 Uhr wird einmal pro Tag der Job 'berichte.abend' geplant (dedupe je Tag).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { quoten, type Tageszeile } from '@/lib/sales-controlling/tagesbericht';
import { ladeTagesbericht, tageZwischen } from '@/lib/sales-controlling/tagesbericht-laden';
import { META_FILTER } from '@/lib/sales-controlling/quellen';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';
import { berlinTag } from '@/lib/zeit/berlin';
import { slackKanal } from '@/lib/slack/kanaele';

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

const plusTage = (tag: string, n: number) => new Date(new Date(`${tag}T12:00:00Z`).getTime() + n * TAG).toISOString().slice(0, 10);
const wochenStart = (tag: string) => plusTage(tag, -((new Date(`${tag}T12:00:00Z`).getUTCDay() + 6) % 7));
const monatsStart = (tag: string) => `${tag.slice(0, 8)}01`;

/** Tick: ab 20 Uhr einmal täglich den Abendbericht einplanen */
export async function planeAbendbericht(svc: SupabaseClient, jetzt: Date = new Date()): Promise<void> {
  if (berlinStunde(jetzt) < ABEND_STUNDE) return;
  const tag = berlinTag(jetzt);
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
  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
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

function summiere<T extends object>(werte: T[], leer: T): T {
  const s = { ...leer } as Record<string, number>;
  for (const w of werte) for (const [k, v] of Object.entries(w)) if (typeof v === 'number') s[k] = (s[k] ?? 0) + v;
  return s as T;
}

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: n < 100 ? 2 : 0 });
const z = (n: number) => n.toLocaleString('de-DE');
const p = (n: number | null) => (n === null ? '–' : `${n.toLocaleString('de-DE')} %`);
const teilen = (a: number, b: number) => (b > 0 ? a / b : null);

export function marketingZeilen(m: MarketingTag): string[] {
  const cpl = teilen(m.ausgaben, m.eintragungen || m.metaLeads);
  const ctr = teilen(m.linkKlicks, m.impressionen);
  const cpc = teilen(m.ausgaben, m.linkKlicks);
  const cpm = teilen(m.ausgaben * 1000, m.impressionen);
  return [
    `Ausgaben *${eur(m.ausgaben)}* · Leads *${z(m.eintragungen)}* (Meta: ${z(m.metaLeads)}) · CPL *${cpl === null ? '–' : eur(cpl)}*`,
    `Impressionen ${z(m.impressionen)} · Link-Klicks ${z(m.linkKlicks)} · CTR ${ctr === null ? '–' : p(Math.round(ctr * 1000) / 10)} · CPC ${cpc === null ? '–' : eur(cpc)} · CPM ${cpm === null ? '–' : eur(cpm)}`,
    `Direkt gebucht ${p(quoten({ ...LEER_SALES, eintragungen: m.eintragungen, direktGebucht: m.direktGebucht }).direktQuote)}`,
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

export function salesZeilen(s: SalesTag): string[] {
  const q = quoten(s);
  return [
    `Settings geführt *${z(s.settingsGehalten)}* · No-Shows ${z(s.settingsNoShow)} · Show-up ${p(q.showUpSetting)} · neu gebucht ${z(s.settingsGebucht)}`,
    `Closings geführt *${z(s.closingsGehalten)}* · No-Shows ${z(s.closingsNoShow)} · Show-up ${p(q.showUpClosing)} · Quali-Rate ${p(q.qualifizierung)}`,
    `Abschlüsse *${z(s.abschluesse)}* · Volumen *${eur(s.volumen)}* · Closing-Rate ${p(q.closingRate)}`,
    `Anwahlen ${z(s.anwahlen)} · Gespräche ${z(s.gespraeche)} · Protokolle fehlen ${z(s.protokolleFehlen)}`,
  ];
}

function abschnitte(titel: string, teile: Array<{ label: string; zeilen: string[] }>) {
  return [
    { type: 'header', text: { type: 'plain_text', text: titel } },
    ...teile.flatMap((t) => [{ type: 'section', text: { type: 'mrkdwn', text: `*${t.label}*\n${t.zeilen.join('\n')}` } }]),
    { type: 'context', elements: [{ type: 'mrkdwn', text: '<https://cloud.zoeppmedia.de/admin/vertrieb|Sales-Controlling> · Zahlen aus Close und Meta Ads' }] },
  ];
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

/** Job 'berichte.abend': Kennzahlen speichern und Marketing + Sales nach Slack schicken */
export async function sendeAbendbericht(svc: SupabaseClient, tag: string): Promise<void> {
  const d = await erfasseKennzahlen(svc, tag);
  const woche = tageZwischen(wochenStart(tag), tag);
  const monat = tageZwischen(monatsStart(tag), tag);
  const istSonntag = new Date(`${tag}T12:00:00Z`).getUTCDay() === 0;
  const istMonatsende = plusTage(tag, 1).slice(0, 7) !== tag.slice(0, 7);

  const datum = new Date(`${tag}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  const monatName = new Date(`${tag}T12:00:00Z`).toLocaleDateString('de-DE', { month: 'long', timeZone: 'UTC' });
  const art = [istSonntag && 'Wochenbericht', istMonatsende && 'Monatsbericht'].filter(Boolean).join(' & ');
  const zusatz = art ? ` · ${art}` : '';
  const zeitraeume = (label: string) => [
    { label: `Heute (${datum})`, tage: [tag] },
    { label: `Woche bis heute (seit ${new Date(`${woche[woche.length - 1]}T12:00:00Z`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })})`, tage: woche },
    { label: `${monatName} bis heute`, tage: monat },
  ].map((x) => ({ ...x, label: x.label + label }));

  const fehler: string[] = [];
  const marketingKanal = await slackKanal('marketing');
  if (marketingKanal) {
    const teile = d.metaVerbunden
      ? zeitraeume('').map((x) => ({ label: x.label, zeilen: marketingZeilen(summiere(x.tage.map((t) => d.marketing.get(t) ?? LEER_MARKETING), LEER_MARKETING)) }))
      : [{ label: 'Meta Ads nicht verbunden', zeilen: ['META_ACCESS_TOKEN / META_AD_ACCOUNT_ID fehlen in Vercel.'] }];
    await postSlack(marketingKanal, abschnitte(`📣 Marketing – ${datum}${zusatz}`, teile), `Marketing ${datum}`).catch((e) => fehler.push(String(e)));
  }

  const salesKanal = await slackKanal('sales');
  if (salesKanal) {
    const teile = zeitraeume('').map((x) => ({ label: x.label, zeilen: salesZeilen(summiere(x.tage.map((t) => d.sales.get(t) ?? LEER_SALES), LEER_SALES)) }));
    await postSlack(salesKanal, abschnitte(`💼 Sales – ${datum}${zusatz}`, teile), `Sales ${datum}`).catch((e) => fehler.push(String(e)));
  }

  // Kein Retry bei Slack-Fehlern: sonst ginge der andere Bericht mehrfach raus. Kennzahlen sind gespeichert.
  if (fehler.length) console.error('[abendbericht] Slack-Versand fehlgeschlagen:', fehler.join(' | '));
}
