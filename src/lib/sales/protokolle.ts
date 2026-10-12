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
 * „Follow-up-Protokoll“ (Setting-/Closing-Follow-up, No-Show-Rückholung):
 * - Nicht erreicht („Erreicht?“ = Nein / Mailbox oder Ergebnis „Nicht erreicht“) → Lead gesperrt bis Kalender, sonst 1 Tag
 *   → verschwindet so lange aus den Smart Views (z. B. „Setting No-Show zurückholen“)
 * - „Weiter Follow-up“ mit Kalender → gesperrt bis zum Kalender-Termin
 * - „Erstgespräch gelegt“ → Lead-Status „Setting“, Sperre aufgehoben, Opportunity aus „Setting – No Show“ /
 *   „Setting – Follow Up“ auf „Setting – Terminiert“ (ohne aktive Opportunity: neu angelegt)
 * - „Beratungsgespräch gelegt“ → Lead-Status „Closing“, Sperre aufgehoben, Opportunity aus „Closing – No Show“ /
 *   „Closing – Follow Up“ oder einer Setting-Stufe auf „Closing – Terminiert“ (ohne aktive Opportunity: neu angelegt)
 *
 * - „Abgeschlossen“ → wie im Closing-Protokoll (siehe unten)
 *
 * „3 - Gesprächsprotokoll (Closing)“:
 * - Nächster Schritt „1. Abgeschlossen“ → Lead-Status „Kunde“, Sperre aufgehoben, aktive Opportunity auf „Close“ (gewonnen).
 *   Ohne aktive Opportunity wird eine gewonnene angelegt. Fehlt das Auftragsvolumen, bekommt der Closer eine Close-Aufgabe.
 * - Nur mit Freigabe „closing_ergebnisse“: Angebot → „Angebot verschickt“ (+ Nachfass-Aufgaben Tag 1/3/7 mit Freigabe
 *   „angebot_nachfassen“), CC2 → „CC2 – Terminiert“, No-Show → „Closing – No Show“, Verschoben → „Closing – Terminiert“,
 *   Verloren → Opportunities verloren, Unqualifiziert → Lead „Unqualifiziert“ (3 Monate gesperrt), Disqualifiziert → Lead „Disqualifiziert“.
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

export const FOLLOWUP_FELDER_IDS = {
  erreicht: 'cf_Cua7sMxQ2f21XKBBaWBNcb0eDpWpGkLDkLcKlt0nihI',
  ergebnis: 'cf_JKIoBAGq8wjSE0mo8C6lyWjMZHRw8WlwNJrqb0LpWeN',
  kalender: 'cf_TXou3dAspi00xZ6gcrT0wXGoWq7IgDMBAJcXqcHszCR',
} as const;

const LEAD_FELD_GESPERRT_BIS = 'cf_ivdENLjTV0OBF9z2It0W5CikYZMBZbE54BgcbINdO9S';
const LEAD_FELD_OPENER = 'cf_WulUyfWOcjbpGnilUPCSspdFzZ3uxsnW1H6AsAMyIBE';
const LEAD_STATUS_UNQUALIFIZIERT = 'stat_rLRfgTDAiphn7YtSgZcMvw8dZcvgJy8Msi35wkSptkx';
const LEAD_STATUS_BAD_DATA = 'stat_KOgUVO1WFOP8s8ONyvCrUMPgTeuplY3YH7nRqUhTUvO';
const OPP_STATUS_VERLOREN = 'stat_843j170eWlP742evQCGjL4BRdczZY4hGTTiV7s0LVZe';
const OPP_SETTING_TERMINIERT = 'stat_ijQBHlkm3ij7uu8hnszgMzR3eIvWVKMo6vkrIVGyKBH';
const OPP_CLOSING_TERMINIERT = 'stat_RjrZL3ifb4mKNiPEFFX1IQgse1fbI94R9XZgere2wZT';
const LEAD_STATUS_CLOSING = 'stat_BqlpXrf3Xh0QnPwZ3ND2a9dbaola4XCIzmFRlgWFnXW';
const LEAD_STATUS_KUNDE = 'stat_p7s3wz4JnH4ftamYyGTIHf8I3Gy9fBuxqhIfKufqmGG';
const OPP_GEWONNEN = 'stat_BFVJiIlomolS2JMTSHc49cHnvh2Rl1IuWnudLEYRh0n';
const OPP_ANGEBOT = 'stat_rfJv0gUGFIaEo2LQc7CkKKjSjabGuE509yRR0gZjozP';
const OPP_CC2 = 'stat_TTFBUyYC71TwPVSrEmD0pa0GbqRowRt71e5xI5LFMTN';
const OPP_CLOSING_NO_SHOW = 'stat_mOm4p6MGvO3A6dnmolp5G3l0TWM7v9fOjlJBkaNUlRG';
const LEAD_STATUS_DISQUALIFIZIERT = 'stat_8dSmRG4WxUrYGItFQyAy0B4lksHZYeaxnkmUiqKbuCu';

export const CLOSING_FELDER = {
  naechsterSchritt: 'cf_BhCW7idf0P9fl8ba0D6OZJIwuUDqiiBhHwgJCJbScuJ',
  kalender: 'cf_8gj9WdroQPN5i1M8IhpQ8s30fL4pOF1fRW25kbIrGNU',
} as const;
const PIPELINE_ID = 'pipe_5E14qCHzi8u3cHk0bB44ky';
/** Closing – No Show, Closing – Follow Up, Setting – Terminiert / No Show / Follow Up */
const OPP_CLOSING_ZURUECK = [
  'stat_mOm4p6MGvO3A6dnmolp5G3l0TWM7v9fOjlJBkaNUlRG',
  'stat_qdOAuGHxRx66Mk45E58gOOXnceL04Iouh6nAuoEXyjy',
  'stat_ijQBHlkm3ij7uu8hnszgMzR3eIvWVKMo6vkrIVGyKBH',
  'stat_0NNi8KdI13PSUkUiNv46IQ4kZS68xYyS6XqpQA8Oqe7',
  'stat_EWpujNpwdtq5HSFAMO6c0awZUVgsz6TfO1ZXe5Ff8IT',
];
/** Setting – No Show, Setting – Follow Up */
const OPP_SETTING_ZURUECK = ['stat_0NNi8KdI13PSUkUiNv46IQ4kZS68xYyS6XqpQA8Oqe7', 'stat_EWpujNpwdtq5HSFAMO6c0awZUVgsz6TfO1ZXe5Ff8IT'];

const TYP_NAME: Record<string, string> = {
  [PROTOKOLL_TYPEN.coldCall]: 'terminierung',
  [PROTOKOLL_TYPEN.setting]: 'setting',
  [PROTOKOLL_TYPEN.closing]: 'closing',
  [PROTOKOLL_TYPEN.followUp]: 'follow_up',
};

export interface Aktionen {
  gesperrtBis?: string;
  leadStatus?: 'setting' | 'unqualifiziert' | 'bad_data' | 'disqualifiziert';
  /** Closing: aktive Opportunity auf diesen Status (Angebot, CC2, No-Show, Verschoben) */
  oppStatus?: 'angebot' | 'cc2' | 'closing_no_show' | 'closing_terminiert';
  /** Closing: Angebot verschickt → Nachfass-Aufgaben für den Closer */
  angebotNachfassen?: boolean;
  oppsVerloren?: boolean;
  settingOpportunity?: boolean;
  /** Follow-up: Erstgespräch neu gelegt → Opportunity zurück auf „Setting – Terminiert“ */
  settingTerminiert?: boolean;
  /** Follow-up: Beratungsgespräch gelegt → Opportunity auf „Closing – Terminiert“ */
  closingTerminiert?: boolean;
  /** Closing / Follow-up: abgeschlossen → Lead „Kunde“, Opportunity gewonnen */
  abgeschlossen?: boolean;
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

/** Regeln für das Follow-up-Protokoll (rein, testbar) */
export function regelnFollowUp(felder: Record<string, string | null>, jetzt: Date): Aktionen {
  const erreicht = felder[FOLLOWUP_FELDER_IDS.erreicht] ?? '';
  const ergebnis = felder[FOLLOWUP_FELDER_IDS.ergebnis] ?? '';
  const kalender = felder[FOLLOWUP_FELDER_IDS.kalender] || null;
  const morgen = new Date(jetzt.getTime() + TAG).toISOString();
  const bisKalender = kalender && new Date(kalender).getTime() > jetzt.getTime() ? new Date(kalender).toISOString() : null;
  if (ergebnis.startsWith('Abgeschlossen')) return { abgeschlossen: true };
  if (ergebnis.startsWith('Erstgespräch gelegt')) return { settingTerminiert: true, termin: kalender };
  if (ergebnis.startsWith('Beratungsgespräch gelegt')) return { closingTerminiert: true, termin: kalender };
  if (erreicht.startsWith('Nein') || ergebnis.startsWith('Nicht erreicht')) return { gesperrtBis: bisKalender ?? morgen };
  if (ergebnis.startsWith('Weiter Follow-up') && bisKalender) return { gesperrtBis: bisKalender };
  return {};
}

/** Regeln für das Closing-Protokoll (rein, testbar). Alles außer „Abgeschlossen“ braucht die Freigabe closing_ergebnisse. */
export function regelnClosing(felder: Record<string, string | null>, jetzt: Date = new Date()): Aktionen {
  const schritt = (felder[CLOSING_FELDER.naechsterSchritt] ?? '').replace(/^\d+\.\s*/, '');
  const kalender = felder[CLOSING_FELDER.kalender] || null;
  if (schritt.startsWith('Abgeschlossen')) return { abgeschlossen: true };
  if (schritt.startsWith('Angebot')) return { oppStatus: 'angebot', angebotNachfassen: true };
  if (schritt.startsWith('Unqualifiziert')) return { leadStatus: 'unqualifiziert', oppsVerloren: true, gesperrtBis: plusMonate(jetzt, 3).toISOString() };
  if (schritt.startsWith('Disqualifiziert')) return { leadStatus: 'disqualifiziert', oppsVerloren: true };
  if (schritt.startsWith('CC2')) return { oppStatus: 'cc2', termin: kalender };
  if (schritt.startsWith('No-Show')) return { oppStatus: 'closing_no_show' };
  if (schritt.startsWith('Verschoben')) return { oppStatus: 'closing_terminiert', termin: kalender };
  if (schritt.startsWith('Verloren')) return { oppsVerloren: true };
  return {};
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
    const status = { setting: LEAD_STATUS_SETTING, unqualifiziert: LEAD_STATUS_UNQUALIFIZIERT, bad_data: LEAD_STATUS_BAD_DATA, disqualifiziert: LEAD_STATUS_DISQUALIFIZIERT }[a.leadStatus];
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
  if (a.settingTerminiert) {
    // Lead wieder im Setting und nicht mehr gesperrt (sonst bliebe er aus den Ansichten verschwunden)
    await setzeLead(leadId, { status_id: LEAD_STATUS_SETTING, [`custom.${LEAD_FELD_GESPERRT_BIS}`]: null });
    const { data } = await closeJson<{ data: Array<{ id: string; status_id: string }> }>(`/opportunity/?lead_id=${leadId}&status_type=active&_fields=id,status_id`);
    const zurueck = data.find((o) => OPP_SETTING_ZURUECK.includes(o.status_id));
    if (zurueck) {
      await closeJson(`/opportunity/${zurueck.id}/`, { method: 'PUT', body: JSON.stringify({ status_id: OPP_SETTING_TERMINIERT }) });
      erledigt.opportunity = 'auf_setting_terminiert';
    } else {
      const termin = a.termin
        ? new Date(a.termin).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr'
        : 'Termin laut Protokoll';
      // Legt nur an, wenn es gar keine aktive Opportunity gibt
      erledigt.opportunity = await legeSettingOpportunityAn(leadId, `Erstgespräch neu gelegt (Follow-up): ${termin}`);
    }
  }
  if (a.closingTerminiert) {
    await setzeLead(leadId, { status_id: LEAD_STATUS_CLOSING, [`custom.${LEAD_FELD_GESPERRT_BIS}`]: null });
    const { data } = await closeJson<{ data: Array<{ id: string; status_id: string }> }>(`/opportunity/?lead_id=${leadId}&status_type=active&_fields=id,status_id`);
    const zurueck = data.find((o) => OPP_CLOSING_ZURUECK.includes(o.status_id));
    if (zurueck) {
      await closeJson(`/opportunity/${zurueck.id}/`, { method: 'PUT', body: JSON.stringify({ status_id: OPP_CLOSING_TERMINIERT }) });
      erledigt.opportunity = 'auf_closing_terminiert';
    } else if (data.length) {
      // Andere aktive Opportunity (z. B. schon „Closing – Terminiert“ oder „Angebot“) nicht anfassen
      erledigt.opportunity = 'vorhanden';
    } else {
      const termin = a.termin
        ? new Date(a.termin).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr'
        : 'Termin laut Protokoll';
      await closeJson('/opportunity/', {
        method: 'POST',
        body: JSON.stringify({ lead_id: leadId, pipeline_id: PIPELINE_ID, status_id: OPP_CLOSING_TERMINIERT, note: `Beratungsgespräch gelegt (Follow-up): ${termin}` }),
      });
      erledigt.opportunity = 'angelegt';
    }
  }
  if (a.oppStatus) {
    const ziel = { angebot: OPP_ANGEBOT, cc2: OPP_CC2, closing_no_show: OPP_CLOSING_NO_SHOW, closing_terminiert: OPP_CLOSING_TERMINIERT }[a.oppStatus];
    const { data: aktiv } = await closeJson<{ data: Array<{ id: string; status_id: string; date_created: string }> }>(`/opportunity/?lead_id=${leadId}&status_type=active&_fields=id,status_id,date_created`);
    const opp = [...aktiv].sort((x, y) => y.date_created.localeCompare(x.date_created))[0];
    if (opp && opp.status_id !== ziel) {
      await closeJson(`/opportunity/${opp.id}/`, { method: 'PUT', body: JSON.stringify({ status_id: ziel }) });
      erledigt.opportunity = a.oppStatus;
    } else if (!opp) {
      await closeJson('/opportunity/', { method: 'POST', body: JSON.stringify({ lead_id: leadId, pipeline_id: PIPELINE_ID, status_id: ziel, note: 'Laut Closing-Protokoll' }) });
      erledigt.opportunity = `${a.oppStatus}_angelegt`;
    }
  }
  if (a.angebotNachfassen) {
    // Nachfassen per Anruf durch den Closer – keine automatische Nachricht an den Lead
    const heute = new Date();
    for (const [tage, text] of [
      [1, '📨 Angebot nachfassen (Tag 1): Ist das Angebot angekommen? Offene Fragen klären'],
      [3, '📨 Angebot nachfassen (Tag 3): Entscheidung abfragen, Einwände klären'],
      [7, '📨 Angebot nachfassen (Tag 7): Letzter Anstoß – zusagen oder sauber abschließen'],
    ] as const) {
      const datum = new Date(heute.getTime() + tage * TAG).toISOString().slice(0, 10);
      await closeJson('/task/', { method: 'POST', body: JSON.stringify({ lead_id: leadId, ...(userId ? { assigned_to: userId } : {}), text, date: datum }) });
    }
    erledigt.nachfassAufgaben = 3;
  }
  if (a.abgeschlossen) {
    await setzeLead(leadId, { status_id: LEAD_STATUS_KUNDE, [`custom.${LEAD_FELD_GESPERRT_BIS}`]: null });
    erledigt.leadStatus = 'kunde';
    const { data: aktiv } = await closeJson<{ data: Array<{ id: string; status_id: string; value: number | null; date_created: string }> }>(
      `/opportunity/?lead_id=${leadId}&status_type=active&_fields=id,status_id,value,date_created`,
    );
    const { data: gewonnen } = await closeJson<{ data: Array<{ id: string; value: number | null }> }>(`/opportunity/?lead_id=${leadId}&status_type=won&_fields=id,value`);
    let opp: { id: string; value: number | null } | null = null;
    if (aktiv.length) {
      // Die jüngste aktive Opportunity ist der Abschluss
      opp = [...aktiv].sort((x, y) => y.date_created.localeCompare(x.date_created))[0];
      await closeJson(`/opportunity/${opp.id}/`, { method: 'PUT', body: JSON.stringify({ status_id: OPP_GEWONNEN }) });
      erledigt.opportunity = 'gewonnen';
    } else if (gewonnen.length) {
      opp = gewonnen[0];
      erledigt.opportunity = 'schon_gewonnen';
    } else {
      opp = await closeJson<{ id: string; value: number | null }>('/opportunity/', {
        method: 'POST',
        body: JSON.stringify({ lead_id: leadId, pipeline_id: PIPELINE_ID, status_id: OPP_GEWONNEN, note: 'Abschluss laut Gesprächsprotokoll' }),
      });
      erledigt.opportunity = 'gewonnen_angelegt';
    }
    // Ohne Auftragsvolumen zählt der Abschluss im Controlling mit 0 € → Closer erinnern
    if (opp && !opp.value) {
      await closeJson('/task/', {
        method: 'POST',
        body: JSON.stringify({ lead_id: leadId, ...(userId ? { assigned_to: userId } : {}), text: '💰 Abschluss: Auftragsvolumen in der Opportunity eintragen', date: new Date().toISOString().slice(0, 10) }),
      }).catch(() => {});
      erledigt.volumenAufgabe = true;
    }
  }
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

/** Job sales.protokoll: Protokoll laden, speichern und (bei Terminierung / Follow-up) die Regeln in Close umsetzen */
export async function verarbeiteProtokoll(svc: SupabaseClient, activityId: string, jetzt: Date = new Date()): Promise<string> {
  const a = await closeJson<CloseCustomActivity>(`/activity/custom/${activityId}/`);
  if (a.status && a.status !== 'published') return 'entwurf';
  const typ = TYP_NAME[a.custom_activity_type_id];
  if (!typ) return 'fremder_typ';
  const felder = felderAus(a);

  // Schon verarbeitet? (Close schickt created + updated)
  // Schon umgesetzt? Nur erneut ausführen, wenn sich das ausschlaggebende Ergebnis geändert hat (Korrektur im Protokoll)
  const { data: vorhanden } = await svc.from('close_protokolle').select('id, aktionen').eq('id', a.id).maybeSingle();
  const alteAktionen = (vorhanden as { aktionen: { schluessel?: string } | null } | null)?.aktionen ?? null;
  const schluesselFelder =
    typ === 'follow_up'
      ? [FOLLOWUP_FELDER_IDS.erreicht, FOLLOWUP_FELDER_IDS.ergebnis, FOLLOWUP_FELDER_IDS.kalender]
      : typ === 'closing'
        ? [CLOSING_FELDER.naechsterSchritt, CLOSING_FELDER.kalender]
        : [TERMINIERUNG_FELDER.wenErreicht, TERMINIERUNG_FELDER.gatekeeperErgebnis, TERMINIERUNG_FELDER.ergebnis, TERMINIERUNG_FELDER.kalender];
  const schluessel = schluesselFelder.map((f) => felder[f] ?? '').join('|');

  let aktionen: Record<string, unknown> | null = null;
  const regeln = typ === 'terminierung' ? regelnTerminierung : typ === 'follow_up' ? regelnFollowUp : typ === 'closing' ? regelnClosing : null;
  if (regeln && a.lead_id && (!alteAktionen || alteAktionen.schluessel !== schluessel)) {
    let plan = regeln(felder, jetzt);
    // Closing: nur „Abgeschlossen“ läuft immer – alles andere erst nach Freigabe (/admin/freigaben)
    if (typ === 'closing' && !plan.abgeschlossen && Object.keys(plan).length) {
      const { ladeFreigaben } = await import('@/lib/freigaben');
      const f = await ladeFreigaben(svc);
      if (!f.closing_ergebnisse) plan = {};
      else if (!f.angebot_nachfassen) plan = { ...plan, angebotNachfassen: false };
    }
    aktionen = { ...(await fuehreAus(a.lead_id, plan, a.user_id)), schluessel };
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
  if (a.lead_id) {
    const { schliesseLuecken } = await import('./protokoll-pflicht');
    await schliesseLuecken(svc, a.lead_id).catch(() => {});
  }
  return aktionen ? 'ausgefuehrt' : 'gespeichert';
}
