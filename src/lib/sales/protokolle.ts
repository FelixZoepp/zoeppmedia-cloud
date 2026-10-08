/**
 * Gesprächsprotokolle aus Close (Custom Activities) automatisch umsetzen und speichern.
 *
 * „1 - Gesprächsprotokoll (Terminierung)“:
 * - Niemand / Mailbox → Lead 1 Tag gesperrt (bleibt im Leadpool)
 * - Gatekeeper → gesperrt bis Kalender, sonst 1 Tag („Handy/Durchwahl bekommen“ sperrt nicht)
 * - Kein Interesse 3M / 6M → 3 bzw. 6 Monate gesperrt (bleibt im Leadpool)
 * - Rückruf vereinbart → gesperrt bis Kalender, sonst 1 Tag
 * - Setting vereinbart → Lead-Status „Setting“, Opportunity „Setting – Terminiert“, Opener eingetragen
 * - Unqualifiziert / Bad Data → Lead-Status entsprechend, offene Opportunities „Verloren“
 * Ein gesetzter Kalender im Protokoll gilt immer als „gesperrt bis“ (außer bei Setting/Unqualifiziert/Bad Data).
 *
 * Jedes Protokoll (alle Typen) landet in close_protokolle – für Auswertungen je Person und Tag.
 * Ablauf: Close-Webhook activity.custom_activity → Job sales.protokoll (dedupe je Aktivität) → hier.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { legeSettingOpportunityAn, LEAD_STATUS_SETTING } from './funnel-lead';
import { PROTOKOLL_TYPEN } from '@/lib/sales-controlling/tagesbericht';

const CLOSE_BASE = 'https://api.close.com/api/v1';
const TAG = 864e5;

export const TERMINIERUNG_FELDER = {
  wenErreicht: 'cf_U3JJwHBkSgOGtEKO4wd7b5EeLbUyv0uBXAQuG3GgEu6',
  gatekeeperErgebnis: 'cf_oub15o5BHQNpOwl8TPbMztF5axjo7oOaYKqz949suRk',
  ergebnis: 'cf_0qd3PlDb9re1MU97cxNV7MJUXjHVYGmuifQc5CsTrN1',
  einwand: 'cf_LrfCv9jCiQOAkx4EaBAa3E3rzA5NIfa4CIfWT2rwuhe',
  kalender: 'cf_M9ZoB7v81dzKGCHLAu43qVAmNKhZ94TIXskUxLEQPBA',
  gelegtAuf: 'cf_IyliLY3PMMXOVdqlG83hpCesfo9N5R98AYxsiFF5T0p',
} as const;

const LEAD_FELD_GESPERRT_BIS = 'cf_ivdENLjTV0OBF9z2It0W5CikYZMBZbE54BgcbINdO9S';
const LEAD_FELD_OPENER = 'cf_WulUyfWOcjbpGnilUPCSspdFzZ3uxsnW1H6AsAMyIBE';
const LEAD_STATUS_UNQUALIFIZIERT = 'stat_rLRfgTDAiphn7YtSgZcMvw8dZcvgJy8Msi35wkSptkx';
const LEAD_STATUS_BAD_DATA = 'stat_KOgUVO1WFOP8s8ONyvCrUMPgTeuplY3YH7nRqUhTUvO';
const OPP_STATUS_VERLOREN = 'stat_843j170eWlP742evQCGjL4BRdczZY4hGTTiV7s0LVZe';

const TYP_NAME: Record<string, string> = {
  [PROTOKOLL_TYPEN.coldCall]: 'terminierung',
  [PROTOKOLL_TYPEN.setting]: 'setting',
  [PROTOKOLL_TYPEN.closing]: 'closing',
  [PROTOKOLL_TYPEN.followUp]: 'follow_up',
};

export interface Aktionen {
  gesperrtBis?: string;
  leadStatus?: 'setting' | 'unqualifiziert' | 'bad_data';
  oppsVerloren?: boolean;
  settingOpportunity?: boolean;
  /** Termin / Rückruf aus dem Kalenderfeld */
  termin?: string | null;
}

function plusMonate(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
}

/** Regeln für das Terminierungs-Protokoll (rein, testbar) */
export function regelnTerminierung(felder: Record<string, string | null>, jetzt: Date): Aktionen {
  const wen = felder[TERMINIERUNG_FELDER.wenErreicht] ?? '';
  const gk = felder[TERMINIERUNG_FELDER.gatekeeperErgebnis] ?? '';
  const ergebnis = felder[TERMINIERUNG_FELDER.ergebnis] ?? '';
  const kalender = felder[TERMINIERUNG_FELDER.kalender] || null;
  const morgen = new Date(jetzt.getTime() + TAG).toISOString();
  const bisKalender = kalender && new Date(kalender).getTime() > jetzt.getTime() ? new Date(kalender).toISOString() : null;

  if (ergebnis.startsWith('Setting vereinbart')) return { leadStatus: 'setting', settingOpportunity: true, termin: kalender };
  // Nach 3 Monaten holt die tägliche Reaktivierung den Lead zurück in den Leadpool
  if (ergebnis.startsWith('Unqualifiziert')) return { leadStatus: 'unqualifiziert', oppsVerloren: true, gesperrtBis: plusMonate(jetzt, 3).toISOString() };
  if (ergebnis.startsWith('Bad Data')) return { leadStatus: 'bad_data', oppsVerloren: true };
  if (ergebnis.includes('3M')) return { gesperrtBis: plusMonate(jetzt, 3).toISOString() };
  if (ergebnis.includes('6M')) return { gesperrtBis: plusMonate(jetzt, 6).toISOString() };
  if (ergebnis.startsWith('Rückruf')) return { gesperrtBis: bisKalender ?? morgen, termin: kalender };

  if (wen.startsWith('Niemand')) return { gesperrtBis: bisKalender ?? morgen };
  if (wen.startsWith('Gatekeeper')) {
    if (gk.startsWith('Handy')) return bisKalender ? { gesperrtBis: bisKalender } : {};
    return { gesperrtBis: bisKalender ?? morgen, termin: gk.startsWith('Rückruf') ? kalender : null };
  }
  return bisKalender ? { gesperrtBis: bisKalender } : {};
}

/* ── Close ─────────────────────────────────────────────────────── */

function closeHeaders(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}`, 'Content-Type': 'application/json' };
}

async function closeJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLOSE_BASE}${path}`, { ...init, headers: closeHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status} bei ${path.split('?')[0]}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

async function setzeLead(leadId: string, daten: Record<string, unknown>) {
  await closeJson(`/lead/${leadId}/`, { method: 'PUT', body: JSON.stringify(daten) });
}

async function oppsVerloren(leadId: string): Promise<number> {
  const { data } = await closeJson<{ data: Array<{ id: string }> }>(`/opportunity/?lead_id=${leadId}&status_type=active&_fields=id`);
  for (const o of data) await closeJson(`/opportunity/${o.id}/`, { method: 'PUT', body: JSON.stringify({ status_id: OPP_STATUS_VERLOREN }) });
  return data.length;
}

/** Aktionen in Close ausführen */
export async function fuehreAus(leadId: string, a: Aktionen, userId: string | null): Promise<Record<string, unknown>> {
  const erledigt: Record<string, unknown> = {};
  if (a.leadStatus) {
    const status = { setting: LEAD_STATUS_SETTING, unqualifiziert: LEAD_STATUS_UNQUALIFIZIERT, bad_data: LEAD_STATUS_BAD_DATA }[a.leadStatus];
    await setzeLead(leadId, {
      status_id: status,
      ...(a.leadStatus === 'setting' && userId ? { [`custom.${LEAD_FELD_OPENER}`]: userId } : {}),
      // Sperre aufheben, damit der Lead nicht versteckt bleibt
      ...(a.leadStatus === 'setting' ? { [`custom.${LEAD_FELD_GESPERRT_BIS}`]: null } : {}),
    });
    erledigt.leadStatus = a.leadStatus;
  }
  if (a.gesperrtBis) {
    await setzeLead(leadId, { [`custom.${LEAD_FELD_GESPERRT_BIS}`]: a.gesperrtBis });
    erledigt.gesperrtBis = a.gesperrtBis;
  }
  if (a.oppsVerloren) erledigt.oppsVerloren = await oppsVerloren(leadId);
  if (a.settingOpportunity) {
    const termin = a.termin
      ? new Date(a.termin).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr'
      : 'Termin laut Protokoll';
    erledigt.opportunity = await legeSettingOpportunityAn(leadId, `Setting vereinbart (Terminierungs-Anruf): ${termin}`);
  }
  return erledigt;
}

interface CloseCustomActivity {
  id: string;
  custom_activity_type_id: string;
  lead_id: string | null;
  user_id: string | null;
  status?: string;
  activity_at?: string | null;
  date_created: string;
  [k: string]: unknown;
}

function felderAus(a: CloseCustomActivity): Record<string, string | null> {
  const felder: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(a)) {
    if (!k.startsWith('custom.')) continue;
    felder[k.slice(7)] = typeof v === 'string' ? v : v == null ? null : Array.isArray(v) ? v.join(', ') : String(v);
  }
  return felder;
}

/** Job sales.protokoll: Protokoll laden, speichern und (bei Terminierung) die Regeln in Close umsetzen */
export async function verarbeiteProtokoll(svc: SupabaseClient, activityId: string, jetzt: Date = new Date()): Promise<string> {
  const a = await closeJson<CloseCustomActivity>(`/activity/custom/${activityId}/`);
  if (a.status && a.status !== 'published') return 'entwurf';
  const typ = TYP_NAME[a.custom_activity_type_id];
  if (!typ) return 'fremder_typ';
  const felder = felderAus(a);

  // Schon verarbeitet? (Close schickt created + updated)
  const { data: vorhanden } = await svc.from('close_protokolle').select('id, aktionen').eq('id', a.id).maybeSingle();
  const schonAusgefuehrt = !!(vorhanden as { aktionen: unknown } | null)?.aktionen;

  let aktionen: Record<string, unknown> | null = null;
  if (typ === 'terminierung' && a.lead_id && !schonAusgefuehrt) {
    aktionen = await fuehreAus(a.lead_id, regelnTerminierung(felder, jetzt), a.user_id);
  }

  const { error } = await svc.from('close_protokolle').upsert({
    id: a.id,
    typ,
    lead_id: a.lead_id,
    user_id: a.user_id,
    datum: a.activity_at ?? a.date_created,
    felder,
    ...(aktionen ? { aktionen, ausgefuehrt_am: jetzt.toISOString() } : {}),
    aktualisiert_am: jetzt.toISOString(),
  });
  if (error) throw new Error(`Protokoll nicht gespeichert: ${error.message}`);
  return aktionen ? 'ausgefuehrt' : 'gespeichert';
}
