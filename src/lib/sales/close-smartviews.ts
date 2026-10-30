/**
 * Smart Views in Close auf die neuen Gesprächsprotokolle umstellen (über den API-Key der Cloud).
 * Bestehende Views werden per ID aktualisiert (bleiben angepinnt), neue werden angelegt (Abgleich über den Namen).
 * Sicherung der alten Filter: system_einstellungen.close_smartviews_export.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { PROTOKOLL_TYPEN } from '@/lib/sales-controlling/tagesbericht';
import type { CloseKundenIds } from './kunden-sync';

const CLOSE_BASE = 'https://api.close.com/api/v1';

function headers(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}`, 'Content-Type': 'application/json' };
}

async function close<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLOSE_BASE}${path}`, { ...init, headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status} bei ${init?.method ?? 'GET'} ${path.split('?')[0]}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

/* ── IDs ───────────────────────────────────────────────────────── */

const F = {
  gesperrtBis: 'cf_ivdENLjTV0OBF9z2It0W5CikYZMBZbE54BgcbINdO9S',
  settingTermin: 'cf_Xdl1iNhA7n4BORM3AYbBP99ontdBq39ngOdwjTMdZNq',
  // Terminierung
  tKalender: 'cf_M9ZoB7v81dzKGCHLAu43qVAmNKhZ94TIXskUxLEQPBA',
  tErgebnis: 'cf_0qd3PlDb9re1MU97cxNV7MJUXjHVYGmuifQc5CsTrN1',
  tGatekeeper: 'cf_oub15o5BHQNpOwl8TPbMztF5axjo7oOaYKqz949suRk',
  // Setting
  sErgebnis: 'cf_76Hh4UwJmO29mcOhNZdGglGCNpQyccCBbZSciCF3fb3',
  sKalender: 'cf_U7wmwfAu5xqLmfNXv2nYx5EbiLHGFdsZC4nJKHBeR3G',
  // Follow-up
  fErgebnis: 'cf_JKIoBAGq8wjSE0mo8C6lyWjMZHRw8WlwNJrqb0LpWeN',
  fKalender: 'cf_TXou3dAspi00xZ6gcrT0wXGoWq7IgDMBAJcXqcHszCR',
} as const;

const STATUS_KUNDE = 'stat_p7s3wz4JnH4ftamYyGTIHf8I3Gy9fBuxqhIfKufqmGG';

const STATUS = {
  leadpool: 'stat_sgDNPr29uwT7tMPTxzQKW6DDCjbM2JMZzdX3UpeRGLb',
  interessiert: 'stat_Qzunur5ekjXNVsgsWoZbgSAlpdnnLAIQkVnz1ihrElY',
  settingNoShow: 'stat_0NNi8KdI13PSUkUiNv46IQ4kZS68xYyS6XqpQA8Oqe7',
  closingNoShow: 'stat_mOm4p6MGvO3A6dnmolp5G3l0TWM7v9fOjlJBkaNUlRG',
  settingFollowUp: 'stat_EWpujNpwdtq5HSFAMO6c0awZUVgsz6TfO1ZXe5Ff8IT',
  closingFollowUp: 'stat_qdOAuGHxRx66Mk45E58gOOXnceL04Iouh6nAuoEXyjy',
  angebot: 'stat_rfJv0gUGFIaEo2LQc7CkKKjSjabGuE509yRR0gZjozP',
  settingTerminiert: 'stat_ijQBHlkm3ij7uu8hnszgMzR3eIvWVKMo6vkrIVGyKBH',
  verloren: 'stat_843j170eWlP742evQCGjL4BRdczZY4hGTTiV7s0LVZe',
} as const;

const VERLUSTGRUND_FELD = 'cf_VyMmJUFUh8pHoKi14eNuxAavZOT8LCrdpPGKXhsjie0';
const LEADQUELLE_FELD = 'cf_QiH8TTQXCkFg846D3N4qPF6STvbww7q3WJAK3Qja0n8';
const STATUS_GEWONNEN = 'stat_BFVJiIlomolS2JMTSHc49cHnvh2Rl1IuWnudLEYRh0n';
const STATUS_CC2 = 'stat_TTFBUyYC71TwPVSrEmD0pa0GbqRowRt71e5xI5LFMTN';
const STATUS_CLOSING_TERMINIERT = 'stat_RjrZL3ifb4mKNiPEFFX1IQgse1fbI94R9XZgere2wZT';
/** Alle Status der Upsell-Pipeline (Bestandskunden) */
const UPSELL_STATUS = [
  'stat_OBAEVAwpq09YR0N7GeuFF8Zt4QlAycUNRmf88JTZ3AN',
  'stat_WEKJijRPsQybJcoGhit9rkhqImph7jHgS1tB1sP7iiy',
  'stat_RrSDOCdFILg6qphuwTwkxbYWEtIYpGb9CcjeDuce6OT',
  'stat_7kEUHW4wykcSy6Yg1bR9jdbcn6RzWO6hbPGOjIHHT6N',
  'stat_7NL2g8Yj20LVCQZtfAtLD3oe5DDZkMNHSJmsK9XEcAX',
  'stat_gkZ8TgDDZPJOzHkRNL9Pjxt6XbDu6O34uA4KLCnpTOf',
];
const EMPFEHLUNGEN_VIEW_ID = 'save_OL2kMKPFdhp1C2gffeP880RHPcHuaMYv5mrphw8WThX';

const LEAD_SETTING = 'stat_E0PMV0VE8R9KIyqq8aGpBMyvBqjmaih50lXRczPpQ2L';

/* ── Query-Bausteine (Close „s_query“) ─────────────────────────── */

type Q = Record<string, unknown>;
const and = (...queries: Q[]): Q => ({ negate: false, queries, type: 'and' });
const or = (...queries: Q[]): Q => ({ negate: false, queries, type: 'or' });
const cf = (id: string, condition: Q, negate = false): Q => ({ condition, field: { custom_field_id: id, type: 'custom_field' }, negate, type: 'field_condition' });
const feld = (objectType: string, name: string, condition: Q, negate = false): Q => ({
  condition,
  field: { field_name: name, object_type: objectType, type: 'regular_field' },
  negate,
  type: 'field_condition',
});
const term = (...values: string[]): Q => ({ type: 'term', values });
const heute: Q = {
  before: { range: 'today', type: 'start_end_of_predefined_relative_period', which: 'end' },
  on_or_after: { range: 'today', type: 'start_end_of_predefined_relative_period', which: 'start' },
  type: 'moment_range',
};
const bisJetzt: Q = { before: { type: 'now' }, on_or_after: null, type: 'moment_range' };
const offset = (stunden: number) => ({ days: 0, hours: stunden, minutes: 0, months: 0, seconds: 0, weeks: 0, years: 0 });
const letzteStunden = (h: number): Q => ({
  before: { type: 'now' },
  on_or_after: { direction: 'past', moment: { type: 'now' }, offset: offset(h), type: 'offset', which_day_end: 'start' },
  type: 'moment_range',
});
/** Älter als n Tage (Zeitpunkt vor jetzt − n Tage) */
const aelterAlsTage = (tage: number): Q => ({
  before: { direction: 'past', moment: { type: 'now' }, offset: { ...offset(0), days: tage }, type: 'offset', which_day_end: 'start' },
  on_or_after: null,
  type: 'moment_range',
});
/** Zwischen von und bis Tagen her */
const vorTagen = (von: number, bis: number): Q => ({
  before: { direction: 'past', moment: { type: 'now' }, offset: { ...offset(0), days: von }, type: 'offset', which_day_end: 'start' },
  on_or_after: { direction: 'past', moment: { type: 'now' }, offset: { ...offset(0), days: bis }, type: 'offset', which_day_end: 'start' },
  type: 'moment_range',
});
const zahl = (gte?: number, lte?: number, gt?: number): Q => ({ type: 'number_range', ...(gte !== undefined ? { gte } : {}), ...(lte !== undefined ? { lte } : {}), ...(gt !== undefined ? { gt } : {}) });

const protokoll = (typId: string, ...bedingungen: Q[]): Q => ({
  negate: false,
  related_object_type: 'activity.custom_activity',
  related_query: and(feld('activity.custom_activity', 'custom_activity_type_id', term(typId)), ...bedingungen),
  this_object_type: 'lead',
  type: 'has_related',
});
const deal = (...statusIds: string[]): Q => ({
  negate: false,
  related_object_type: 'opportunity',
  related_query: and(feld('opportunity', 'status_id', { object_ids: statusIds, reference_type: 'status.opportunity', type: 'reference' })),
  this_object_type: 'lead',
  type: 'has_related',
});
const leadStatus = (...ids: string[]): Q => feld('lead', 'status_id', { object_ids: ids, reference_type: 'status.lead', type: 'reference' });
const nichtGesperrt = or(cf(F.gesperrtBis, bisJetzt), cf(F.gesperrtBis, { type: 'exists' }, true));
const hatTelefon = feld('lead', 'num_phone_numbers', zahl(undefined, undefined, 0));

const sQuery = (filter: Q, sort: Q[] = []) => ({ query: and({ negate: false, object_type: 'lead', type: 'object_type' }, filter), results_limit: null, sort });
const sortierung = (name: string, richtung: 'asc' | 'desc', objectType = 'lead') => ({ direction: richtung, field: { field_name: name, object_type: objectType, type: 'regular_field' } });

/* ── Smart Views ───────────────────────────────────────────────── */

export function smartViews(closingTerminFeld: string | null, kunden: CloseKundenIds | null = null): Array<{ id?: string; name: string; s_query: Q }> {
  const kundenViews = kunden
    ? [
        {
          id: 'save_Ap0daw8CiYE0bVKt6PjXOtlf4STT79ZBkeoudgreiXy',
          name: '🥩 Upsell-Potenzial',
          s_query: sQuery(and(leadStatus(STATUS_KUNDE), cf(kunden.feldUpsell, term('Ja'))), [sortierung('date_updated', 'asc')]),
        },
        {
          id: 'save_acKA6xzK3XrSx0glfxp3YxhtzvhVnnU7SDBbdkGr9MC',
          name: '💳 Ex Kunde Follow Up',
          s_query: sQuery(and(leadStatus(kunden.statusExKunde), nichtGesperrt), [sortierung('date_updated', 'asc')]),
        },
      ]
    : [];
  return [
    ...kundenViews,
    {
      id: 'save_q72PO9OEVdWeXhTo6QyckLsbt14bQ3QzSkUxlchj3OV',
      name: '📅 2.0 (QC) Erstgespräche heute',
      s_query: sQuery(
        or(
          cf(F.settingTermin, heute),
          protokoll(PROTOKOLL_TYPEN.coldCall, cf(F.tErgebnis, term('Setting vereinbart am:')), cf(F.tKalender, heute)),
          protokoll(PROTOKOLL_TYPEN.followUp, cf(F.fErgebnis, term('Erstgespräch gelegt')), cf(F.fKalender, heute)),
        ),
      ),
    },
    {
      id: 'save_97RImFfg7ELNH8fHLynEjVOx3ytllJ1yuVLoVQ4G4RL',
      name: '📅 1.0 (SC) Beratungsgespräche heute',
      s_query: sQuery(
        or(
          ...(closingTerminFeld ? [cf(closingTerminFeld, heute)] : []),
          protokoll(PROTOKOLL_TYPEN.setting, cf(F.sErgebnis, term('Beratungsgespräch gelegt')), cf(F.sKalender, heute)),
          protokoll(PROTOKOLL_TYPEN.followUp, cf(F.fErgebnis, term('Beratungsgespräch gelegt')), cf(F.fKalender, heute)),
        ),
      ),
    },
    {
      id: 'save_jKY5Hy9jR7EC2e78fElz1CNJ9fNFULDLtBNLszK15d7',
      name: '❌2.1 (QC) Setting No-Show zurückholen',
      s_query: sQuery(and(deal(STATUS.settingNoShow), nichtGesperrt)),
    },
    {
      // Nach „nicht erreicht“ im Follow-up-Protokoll 1 Tag gesperrt → so lange nicht in der Liste
      id: 'save_hHK1L1FDdyCjl92Q2HB8RBHghLfCDVdNWIJvbzYcgVw',
      name: '❌1.1 (SC) Closings No-Show nachfassen',
      s_query: sQuery(and(deal(STATUS.closingNoShow), nichtGesperrt), [sortierung('date_updated', 'asc')]),
    },
    {
      name: '🔥 3.0 Neu eingetragen – sofort anrufen',
      s_query: sQuery(
        and(leadStatus(STATUS.leadpool, STATUS.interessiert), hatTelefon, nichtGesperrt, feld('lead', 'date_created', letzteStunden(24)), feld('lead', 'num_outgoing_calls', zahl(0, 0))),
        [sortierung('date_created', 'desc')],
      ),
    },
    {
      name: '🔁 3.3 Rückrufe heute',
      s_query: sQuery(
        or(
          protokoll(PROTOKOLL_TYPEN.coldCall, cf(F.tKalender, heute), or(cf(F.tErgebnis, term('Rückruf vereinbart am:')), cf(F.tGatekeeper, term('Rückruf vereinbart am:')))),
          protokoll(PROTOKOLL_TYPEN.followUp, cf(F.fErgebnis, term('Weiter Follow-up')), cf(F.fKalender, heute)),
          protokoll(PROTOKOLL_TYPEN.setting, cf(F.sErgebnis, term('Follow-up / Rückruf')), cf(F.sKalender, heute)),
        ),
      ),
    },
    {
      name: '🔁 2.2 (QC) Setting Follow-ups fällig',
      s_query: sQuery(and(deal(STATUS.settingFollowUp), nichtGesperrt), [sortierung('date_updated', 'asc')]),
    },
    {
      name: '💶 1.2 (SC) Angebot / Closing Follow-up',
      s_query: sQuery(and(deal(STATUS.angebot, STATUS.closingFollowUp), nichtGesperrt), [sortierung('date_updated', 'asc')]),
    },
  ];
}

/**
 * „🤑 3.2 (CC) Eingetragen – noch kein Termin“: Leadpool/Interessiert wie bisher – plus Leads im Setting, deren
 * Erstgespräch vorbei ist und deren Deal noch auf „Setting – Terminiert“ steht (verschoben/abgesagt, nie neu gebucht).
 * Gesperrte Leads (Unqualifiziert, Rückruf später …) bleiben draußen.
 */
export const EINGETRAGEN_VIEW = {
  id: 'save_WJBL18ovnqgxlsqyvqY1fzN5V7Gt57preFFK4soA4X6',
  s_query: sQuery(
    and(
      hatTelefon,
      nichtGesperrt,
      or(leadStatus(STATUS.leadpool, STATUS.interessiert), and(leadStatus(LEAD_SETTING), cf(F.settingTermin, bisJetzt), deal(STATUS.settingTerminiert))),
      // Frische, noch nie angerufene Leads stehen in „3.0 Neu eingetragen“ – hier nicht doppelt
      { ...and(feld('lead', 'date_created', letzteStunden(24)), feld('lead', 'num_outgoing_calls', zahl(0, 0))), negate: true },
    ),
    [sortierung('date_updated', 'asc')],
  ),
};

/**
 * „📄 3.4 Report runtergeladen – kein Termin“: Report-Funnel-Leads (Leadquelle „Report – …“) im Leadpool/Interessiert,
 * mit Telefon, nicht gesperrt, ohne gebuchtes Erstgespräch – neueste zuerst (sales/report.ts).
 */
export const REPORT_VIEW = {
  name: '📄 3.4 Report runtergeladen – kein Termin',
  s_query: sQuery(
    and(
      cf('cf_QiH8TTQXCkFg846D3N4qPF6STvbww7q3WJAK3Qja0n8', { mode: 'full_words', type: 'text', value: 'Report' }),
      leadStatus(STATUS.leadpool, STATUS.interessiert),
      hatTelefon,
      nichtGesperrt,
      cf(F.settingTermin, { type: 'exists' }, true),
    ),
    [sortierung('date_created', 'desc')],
  ),
};

/** Report-View anlegen bzw. aktualisieren (nur diese eine, die anderen bleiben unberührt) */
export async function passeReportViewAn(svc: SupabaseClient): Promise<string> {
  const { data: gemerkt } = await svc.from('system_einstellungen').select('wert').eq('key', 'close_smartview_ids').maybeSingle();
  const ids: Record<string, string> = (gemerkt as { wert: string } | null)?.wert ? JSON.parse((gemerkt as { wert: string }).wert) : {};
  const bekannt = ids[REPORT_VIEW.name];
  if (bekannt) {
    await close(`/saved_search/${bekannt}/`, { method: 'PUT', body: JSON.stringify({ s_query: REPORT_VIEW.s_query }) });
    return `angepasst (${bekannt})`;
  }
  const neu = await close<{ id: string }>(`/saved_search/`, { method: 'POST', body: JSON.stringify({ name: REPORT_VIEW.name, type: 'lead', s_query: REPORT_VIEW.s_query, is_shared: true }) });
  ids[REPORT_VIEW.name] = neu.id;
  await svc.from('system_einstellungen').upsert({ key: 'close_smartview_ids', wert: JSON.stringify(ids), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return `neu (${neu.id})`;
}

/** Nur diese eine View aktualisieren (Name bleibt, wie er in Close steht) */
export async function passeEingetragenViewAn(): Promise<void> {
  await close(`/saved_search/${EINGETRAGEN_VIEW.id}/`, { method: 'PUT', body: JSON.stringify({ s_query: EINGETRAGEN_VIEW.s_query }) });
}

/** Ersetzt „👤3.2 (CC) Inbound - nicht angerufen seit 2 Tagen“ (alter Name) durch die neue Liste */
const UMBENENNEN: Record<string, string> = { '👤3.2 (CC) Inbound - nicht angerufen seit 2 Tagen': '🔥 3.0 Neu eingetragen – sofort anrufen' };

/** Lead-Feld „Closing Termin“ sicherstellen (Smart View „Beratungsgespräche heute“, Calendly-Beratungen) */
async function closingTerminFeld(svc: SupabaseClient): Promise<string> {
  const { data } = await close<{ data: Array<{ id: string; name: string }> }>(`/custom_field/lead/?_limit=500`);
  const vorhanden = data.find((f) => f.name.trim() === 'Closing Termin');
  const id = vorhanden?.id ?? (await close<{ id: string }>(`/custom_field/lead/`, { method: 'POST', body: JSON.stringify({ name: 'Closing Termin', type: 'datetime' }) })).id;
  await svc.from('system_einstellungen').upsert({ key: 'close_lead_feld_closing_termin', wert: id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return id;
}

export async function passeSmartViewsAn(svc: SupabaseClient): Promise<Record<string, string>> {
  const feldId = await closingTerminFeld(svc);
  const { data: k } = await svc.from('system_einstellungen').select('wert').eq('key', 'close_kunden_ids').maybeSingle();
  const kunden = (k as { wert: string } | null)?.wert ? (JSON.parse((k as { wert: string }).wert) as CloseKundenIds) : null;
  const alle: Array<{ id: string; name: string }> = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const page = await close<{ data: Array<{ id: string; name: string }>; has_more?: boolean }>(`/saved_search/?_limit=100&_skip=${skip}&_fields=id,name`);
    alle.push(...page.data);
    if (!page.has_more) break;
  }
  // Einmal angelegte Views über ihre ID wiederfinden – auch wenn sie in Close umbenannt wurden
  const { data: gemerkt } = await svc.from('system_einstellungen').select('wert').eq('key', 'close_smartview_ids').maybeSingle();
  const ids: Record<string, string> = (gemerkt as { wert: string } | null)?.wert ? JSON.parse((gemerkt as { wert: string }).wert) : {};
  const ergebnis: Record<string, string> = {};
  for (const v of smartViews(feldId, kunden)) {
    const bekannteId = v.id ?? ids[v.name];
    const ziel =
      (bekannteId ? alle.find((a) => a.id === bekannteId) : undefined) ??
      alle.find((a) => a.name.trim() === v.name) ??
      alle.find((a) => UMBENENNEN[a.name.trim()] === v.name);
    if (ziel) {
      // Namen, die in Close geändert wurden, bleiben erhalten – nur der Filter wird aktualisiert
      const body = bekannteId && ziel.name.trim() !== v.name ? { s_query: v.s_query } : { name: v.name, s_query: v.s_query };
      await close(`/saved_search/${ziel.id}/`, { method: 'PUT', body: JSON.stringify(body) });
      ids[v.name] = ziel.id;
      ergebnis[v.name] = `angepasst (${ziel.id})`;
    } else {
      const neu = await close<{ id: string }>(`/saved_search/`, { method: 'POST', body: JSON.stringify({ name: v.name, type: 'lead', s_query: v.s_query, is_shared: true }) });
      ids[v.name] = neu.id;
      ergebnis[v.name] = `neu (${neu.id})`;
    }
  }
  await svc.from('system_einstellungen').upsert({ key: 'close_smartview_ids', wert: JSON.stringify(ids), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return ergebnis;
}

/** Einzelne Smart View löschen (z. B. Duplikat) */
export async function loescheSmartView(id: string): Promise<void> {
  if (!/^save_[A-Za-z0-9]+$/.test(id)) throw new Error(`Ungültige Smart-View-ID ${id}`);
  await close(`/saved_search/${id}/`, { method: 'DELETE' });
}

/** Controlling-Views löschen (ersetzt durch Tagesbericht/Abendbericht der Cloud; Kunden stehen in „💎 Kunden“). */
export function istControllingView(name: string): boolean {
  const n = name.trim();
  return n.includes('(CO)') || n.startsWith('--Controlling');
}

export async function loescheControllingViews(): Promise<string[]> {
  const alle: Array<{ id: string; name: string }> = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const page = await close<{ data: Array<{ id: string; name: string }>; has_more?: boolean }>(`/saved_search/?_limit=100&_skip=${skip}&_fields=id,name`);
    alle.push(...page.data);
    if (!page.has_more) break;
  }
  const geloescht: string[] = [];
  for (const v of alle.filter((a) => istControllingView(a.name))) {
    await close(`/saved_search/${v.id}/`, { method: 'DELETE' });
    geloescht.push(v.name);
  }
  return geloescht;
}

/**
 * Setter-Listen für den Rückstau (Vorschlag 30.10.2026):
 *  „2.3 Verloren (Ghosting) – nach 30 Tagen nochmal“: Deal verloren mit Grund „Nicht mehr erreichbar (Ghosting)“, seit 30+ Tagen ruhig
 *  „3.4 Alte Leads reaktivieren“: Leadpool/Interessiert, älter als 60 Tage, nie ein Erstgespräch – älteste Bewegung zuerst
 */
const dealMit = (statusIds: string[], ...weitere: Q[]): Q => ({
  negate: false,
  related_object_type: 'opportunity',
  related_query: and(feld('opportunity', 'status_id', { object_ids: statusIds, reference_type: 'status.opportunity', type: 'reference' }), ...weitere),
  this_object_type: 'lead',
  type: 'has_related',
});

/**
 * Weitere Listen (30.10.2026):
 *  „💤 0.9 Ohne Bewegung > 7 Tage“ – offene Deals in No-Show/Follow-up/Angebot/terminiert, seit 7+ Tagen nicht angefasst (Pipeline-Hygiene)
 *  „🥩 1.3 (SC) Upsell fällig“ – Kauf vor 21–45 Tagen, noch kein Deal in der Upsell-Pipeline (Median bis Upsell: ~35 Tage)
 *  „📅 1.4 (SC) CC2 / zweites Closing“ – alle Deals in „CC2 – Terminiert“
 *  „🤝 3.5 (CC) Empfehlungen“ – Leadquelle „Empfehlung“, noch kein Erstgespräch (ersetzt die alte, leere Liste)
 */
export const WEITERE_VIEWS: Array<{ id?: string; name: string; s_query: Q }> = [
  {
    name: '💤 0.9 Ohne Bewegung > 7 Tage',
    s_query: sQuery(
      dealMit(
        [STATUS.settingNoShow, STATUS.settingFollowUp, STATUS.closingNoShow, STATUS.closingFollowUp, STATUS.angebot, STATUS.settingTerminiert, STATUS_CLOSING_TERMINIERT, STATUS_CC2],
        feld('opportunity', 'date_updated', aelterAlsTage(7)),
      ),
      [sortierung('date_updated', 'asc')],
    ),
  },
  {
    name: '🥩 1.3 (SC) Upsell fällig – Kauf vor 3–6 Wochen',
    s_query: sQuery(
      and(dealMit([STATUS_GEWONNEN], feld('opportunity', 'date_won', vorTagen(21, 45))), { ...dealMit(UPSELL_STATUS), negate: true }),
      [sortierung('date_updated', 'asc')],
    ),
  },
  {
    name: '📅 1.4 (SC) CC2 / zweites Closing',
    s_query: sQuery(dealMit([STATUS_CC2]), [sortierung('date_updated', 'asc')]),
  },
  {
    id: EMPFEHLUNGEN_VIEW_ID,
    name: '🤝 3.5 (CC) Empfehlungen',
    s_query: sQuery(
      and(cf(LEADQUELLE_FELD, { mode: 'full_words', type: 'text', value: 'Empfehlung' }), leadStatus(STATUS.leadpool, STATUS.interessiert), cf(F.settingTermin, { type: 'exists' }, true), hatTelefon, nichtGesperrt),
      [sortierung('date_created', 'desc')],
    ),
  },
];

export const NEUE_SETTER_VIEWS: Array<{ name: string; s_query: Q }> = [
  {
    name: '👻 2.3 (QC) Verloren (Ghosting) – nach 30 Tagen nochmal',
    s_query: sQuery(
      and(
        {
          negate: false,
          related_object_type: 'opportunity',
          related_query: and(
            feld('opportunity', 'status_id', { object_ids: [STATUS.verloren], reference_type: 'status.opportunity', type: 'reference' }),
            cf(VERLUSTGRUND_FELD, term('Nicht mehr erreichbar (Ghosting)')),
            feld('opportunity', 'date_updated', aelterAlsTage(30)),
          ),
          this_object_type: 'lead',
          type: 'has_related',
        },
        hatTelefon,
        nichtGesperrt,
      ),
      [sortierung('date_updated', 'asc')],
    ),
  },
  {
    name: '🧊 3.4 (CC) Alte Leads reaktivieren',
    s_query: sQuery(
      and(leadStatus(STATUS.leadpool, STATUS.interessiert), feld('lead', 'date_created', aelterAlsTage(60)), cf(F.settingTermin, { type: 'exists' }, true), hatTelefon, nichtGesperrt),
      [sortierung('date_updated', 'asc')],
    ),
  },
];

/** Nur die neuen Setter-Listen anlegen/aktualisieren + Doppelung 3.0/3.1 bereinigen – die anderen Views bleiben unberührt */
export async function legeSetterListenAn(svc: SupabaseClient): Promise<Record<string, string>> {
  const { data: gemerkt } = await svc.from('system_einstellungen').select('wert').eq('key', 'close_smartview_ids').maybeSingle();
  const ids: Record<string, string> = (gemerkt as { wert: string } | null)?.wert ? JSON.parse((gemerkt as { wert: string }).wert) : {};
  const ergebnis: Record<string, string> = {};
  for (const v of NEUE_SETTER_VIEWS) {
    if (ids[v.name]) {
      await close(`/saved_search/${ids[v.name]}/`, { method: 'PUT', body: JSON.stringify({ s_query: v.s_query }) });
      ergebnis[v.name] = `angepasst (${ids[v.name]})`;
    } else {
      const neu = await close<{ id: string }>(`/saved_search/`, { method: 'POST', body: JSON.stringify({ name: v.name, type: 'lead', s_query: v.s_query, is_shared: true }) });
      ids[v.name] = neu.id;
      ergebnis[v.name] = `neu (${neu.id})`;
    }
  }
  for (const v of WEITERE_VIEWS) {
    const id = v.id ?? ids[v.name];
    if (id) {
      await close(`/saved_search/${id}/`, { method: 'PUT', body: JSON.stringify({ name: v.name, s_query: v.s_query }) });
      ids[v.name] = id;
      ergebnis[v.name] = `angepasst (${id})`;
    } else {
      const neu = await close<{ id: string }>(`/saved_search/`, { method: 'POST', body: JSON.stringify({ name: v.name, type: 'lead', s_query: v.s_query, is_shared: true }) });
      ids[v.name] = neu.id;
      ergebnis[v.name] = `neu (${neu.id})`;
    }
  }
  await passeEingetragenViewAn();
  ergebnis['🤑 3.1 Eingetragen – noch kein Termin'] = 'ohne Doppelung zu 3.0';
  await svc.from('system_einstellungen').upsert({ key: 'close_smartview_ids', wert: JSON.stringify(ids), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return ergebnis;
}
