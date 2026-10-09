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
} as const;

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
