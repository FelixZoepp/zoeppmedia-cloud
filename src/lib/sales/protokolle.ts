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
import { VERLUSTGRUENDE, VERLUSTGRUND_FELD } from './close-aufraeumen';
import { istBestandskunde, UPSELL_PIPELINE_ID, UPSELL_STATUS } from './pipelines';

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
  verlorenGrund: 'cf_WTlYPdZH1Tf1dvOilHwtQY24z3ilVOqBhcPOeyWL4IN',
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

export const SETTING_FELDER = {
  ergebnis: 'cf_76Hh4UwJmO29mcOhNZdGglGCNpQyccCBbZSciCF3fb3',
  kalender: 'cf_U7wmwfAu5xqLmfNXv2nYx5EbiLHGFdsZC4nJKHBeR3G',
  grund: 'cf_F0RQQriozWIK59wJEZqtRTxUPYNU0QAUXk6cgWla6xX',
} as const;

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
  /** Verlustgrund für die verlorenen Opportunities (nur mit Freigabe verlustgrund_automatisch) */
  verlustgrund?: string | null;
  settingOpportunity?: boolean;
  /** Follow-up: Erstgespräch neu gelegt → Opportunity zurück auf „Setting – Terminiert“ */
  settingTerminiert?: boolean;
  /** Follow-up: Beratungsgespräch gelegt → Opportunity auf „Closing – Terminiert“ */
  closingTerminiert?: boolean;
  /** Closing / Follow-up: abgeschlossen → Lead „Kunde“, Opportunity gewonnen */
  abgeschlossen?: boolean;
  /** Termin / Rückruf aus dem Kalenderfeld */
  termin?: string | null;
  /** Rückruf-Aufgabe in Close für den Bearbeiter des Protokolls */
  rueckruf?: { datum: string; text: string };
  /** Nur ausführen, wenn diese Freigabe an ist */
  freigabe?: 'absage_nachfass';
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
  // Verloren mit nächstem Versuch im Kalender (z. B. „3M Follow-up“) → bis dahin aus allen Anruflisten
  if (ergebnis.startsWith('Verloren') && bisKalender) return { gesperrtBis: bisKalender };
  return {};
}

/**
 * Regeln für das Setting-Protokoll (rein, testbar). Nur ein Fall: Unqualifiziert mit Rückruf-Datum im Kalender
 * → Lead bis dahin gesperrt (statt pauschal 3 Monate) und eine Rückruf-Aufgabe an dem Tag. Status und
 * Opportunity setzt der Setter selbst. Keine Nachricht an den Lead.
 */
export function regelnSetting(felder: Record<string, string | null>, jetzt: Date): Aktionen {
  const ergebnis = felder[SETTING_FELDER.ergebnis] ?? '';
  const kalender = felder[SETTING_FELDER.kalender] || null;
  // Abgesagt → Rückruf am Kalender-Tag (bis dahin gesperrt), sonst morgen (Freigabe „absage_nachfass“)
  if (ergebnis.startsWith('Abgesagt')) {
    const spaeter = !!kalender && new Date(kalender).getTime() > jetzt.getTime();
    const datum = spaeter ? new Date(kalender!) : new Date(jetzt.getTime() + 864e5);
    return {
      freigabe: 'absage_nachfass',
      ...(spaeter ? { gesperrtBis: new Date(kalender!).toISOString() } : {}),
      rueckruf: {
        datum: datum.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }),
        text: `📞 Rückruf nach Absage im Setting${spaeter ? ` (${datum.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })} Uhr)` : ''}. Neues Erstgespräch legen.`,
      },
    };
  }
  if (!ergebnis.startsWith('Unqualifiziert') || !kalender || new Date(kalender).getTime() <= jetzt.getTime()) return {};
  const grund = felder[SETTING_FELDER.grund];
  const uhr = new Date(kalender).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  return {
    gesperrtBis: new Date(kalender).toISOString(),
    rueckruf: {
      datum: new Date(kalender).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }),
      text: `📞 Rückruf ${uhr} Uhr (vereinbart im Setting)${grund ? ` – damals unqualifiziert: ${grund}` : ''}. Prüfen, ob es jetzt passt, und neues Erstgespräch legen.`,
    },
  };
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

const EINWAND_GRUND: Record<string, string> = {
  'Kein Budget': 'Kein Budget / nicht liquide (GS 2)',
  'Kein Bedarf mehr': 'Kein Bedarf (GS 1)',
  'Hat schon Anbieter': 'Anderer Anbieter',
};

/**
 * Verlustgrund aus dem Protokoll ableiten (rein, testbar) – nur wenn das Protokoll ihn wirklich nennt:
 * Setting „Unqualifiziert/Disqualifiziert“ + Grund, Follow-up „Verloren“ + Verloren-Grund,
 * Terminierung „Unqualifiziert“ + passender Einwand. Closing hat kein Grund-Feld → null.
 */
export function verlustgrundAusProtokoll(typ: string, felder: Record<string, string | null>): string | null {
  let grund: string | null = null;
  if (typ === 'setting') {
    const ergebnis = felder[SETTING_FELDER.ergebnis] ?? '';
    if (ergebnis.startsWith('Unqualifiziert') || ergebnis.startsWith('Disqualifiziert')) grund = felder[SETTING_FELDER.grund] ?? null;
  } else if (typ === 'follow_up') {
    if ((felder[FOLLOWUP_FELDER_IDS.ergebnis] ?? '').startsWith('Verloren')) grund = felder[FOLLOWUP_FELDER_IDS.verlorenGrund] ?? null;
  } else if (typ === 'terminierung') {
    if ((felder[TERMINIERUNG_FELDER.ergebnis] ?? '').startsWith('Unqualifiziert')) grund = EINWAND_GRUND[felder[TERMINIERUNG_FELDER.einwand] ?? ''] ?? null;
  }
  return grund && (VERLUSTGRUENDE as readonly string[]).includes(grund) ? grund : null;
}

async function setzeLead(leadId: string, daten: Record<string, unknown>) {
  // Bestandskunden bleiben „Kunde“ – ein Upsell-Gespräch stuft sie nicht zurück auf Setting/Closing
  if (daten.status_id && daten.status_id !== LEAD_STATUS_KUNDE) {
    const lead = await closeJson<{ status_label?: string }>(`/lead/${leadId}/?_fields=status_label`);
    if (istBestandskunde(lead.status_label)) {
      const { status_id: _ignoriert, ...rest } = daten;
      void _ignoriert;
      if (!Object.keys(rest).length) return;
      daten = rest;
    }
  }
  await closeJson(`/lead/${leadId}/`, { method: 'PUT', body: JSON.stringify(daten) });
}

type AktiveOpp = { id: string; status_id: string; pipeline_id?: string; value?: number | null; date_created: string };

async function istKunde(leadId: string): Promise<boolean> {
  const lead = await closeJson<{ status_label?: string }>(`/lead/${leadId}/?_fields=status_label`);
  return istBestandskunde(lead.status_label);
}

/** Aktive Deals des Leads (beide Pipelines) */
async function aktiveOpps(leadId: string): Promise<AktiveOpp[]> {
  const { data } = await closeJson<{ data: AktiveOpp[] }>(`/opportunity/?lead_id=${leadId}&status_type=active&_fields=id,status_id,pipeline_id,value,date_created`);
  return data;
}

/**
 * D2D-Status für einen Deal übersetzen: Upsell-Deals bekommen den passenden Upsell-Status, damit sie nicht
 * in die D2D-Pipeline rutschen. null = diesen Deal nicht anfassen (z. B. No-Show/Setting bei einem Upsell).
 */
export function zielStatusFuer(opp: { pipeline_id?: string }, d2dStatus: string): string | null {
  if (opp.pipeline_id !== UPSELL_PIPELINE_ID) return d2dStatus;
  const map: Record<string, string> = {
    [OPP_STATUS_VERLOREN]: UPSELL_STATUS.verloren,
    [OPP_GEWONNEN]: UPSELL_STATUS.gewonnen,
    [OPP_CLOSING_TERMINIERT]: UPSELL_STATUS.strategietermin,
    [OPP_CC2]: UPSELL_STATUS.strategietermin,
    [OPP_ANGEBOT]: UPSELL_STATUS.entscheidung,
  };
  return map[d2dStatus] ?? null;
}

async function oppsVerloren(leadId: string, grund?: string | null): Promise<number> {
  const data = await aktiveOpps(leadId);
  let n = 0;
  for (const o of data) {
    const ziel = zielStatusFuer(o, OPP_STATUS_VERLOREN);
    if (!ziel) continue;
    const body = { status_id: ziel, ...(grund ? { [`custom.${VERLUSTGRUND_FELD}`]: grund } : {}) };
    await closeJson(`/opportunity/${o.id}/`, { method: 'PUT', body: JSON.stringify(body) });
    n++;
  }
  return n;
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
  if (a.oppsVerloren) {
    erledigt.oppsVerloren = await oppsVerloren(leadId, a.verlustgrund);
    if (a.verlustgrund) erledigt.verlustgrund = a.verlustgrund;
  }
  if (a.settingTerminiert) {
    // Lead wieder im Setting und nicht mehr gesperrt (sonst bliebe er aus den Ansichten verschwunden)
    await setzeLead(leadId, { status_id: LEAD_STATUS_SETTING, [`custom.${LEAD_FELD_GESPERRT_BIS}`]: null });
    const data = await aktiveOpps(leadId);
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
    const data = await aktiveOpps(leadId);
    const zurueck = data.find((o) => OPP_CLOSING_ZURUECK.includes(o.status_id));
    const upsellPotenzial = data.find((o) => o.status_id === UPSELL_STATUS.potenzial);
    if (upsellPotenzial) {
      // Upsell: Termin gelegt → „Strategietermin gelegt“ (bleibt in der Upsell-Pipeline)
      await closeJson(`/opportunity/${upsellPotenzial.id}/`, { method: 'PUT', body: JSON.stringify({ status_id: UPSELL_STATUS.strategietermin }) });
      erledigt.opportunity = 'upsell_strategietermin';
    } else if (zurueck) {
      await closeJson(`/opportunity/${zurueck.id}/`, { method: 'PUT', body: JSON.stringify({ status_id: OPP_CLOSING_TERMINIERT }) });
      erledigt.opportunity = 'auf_closing_terminiert';
    } else if (data.length) {
      // Andere aktive Opportunity (z. B. schon „Closing – Terminiert“ oder „Angebot“) nicht anfassen
      erledigt.opportunity = 'vorhanden';
    } else {
      const termin = a.termin
        ? new Date(a.termin).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr'
        : 'Termin laut Protokoll';
      const kunde = await istKunde(leadId);
      await closeJson('/opportunity/', {
        method: 'POST',
        body: JSON.stringify(
          kunde
            ? { lead_id: leadId, pipeline_id: UPSELL_PIPELINE_ID, status_id: UPSELL_STATUS.strategietermin, note: `Upsell-Termin gelegt (Follow-up): ${termin}` }
            : { lead_id: leadId, pipeline_id: PIPELINE_ID, status_id: OPP_CLOSING_TERMINIERT, note: `Beratungsgespräch gelegt (Follow-up): ${termin}` },
        ),
      });
      erledigt.opportunity = kunde ? 'upsell_angelegt' : 'angelegt';
    }
  }
  if (a.oppStatus) {
    const ziel = { angebot: OPP_ANGEBOT, cc2: OPP_CC2, closing_no_show: OPP_CLOSING_NO_SHOW, closing_terminiert: OPP_CLOSING_TERMINIERT }[a.oppStatus];
    const aktiv = await aktiveOpps(leadId);
    const opp = [...aktiv].sort((x, y) => y.date_created.localeCompare(x.date_created))[0];
    const oppZiel = opp ? zielStatusFuer(opp, ziel) : null;
    if (opp && oppZiel && opp.status_id !== oppZiel) {
      await closeJson(`/opportunity/${opp.id}/`, { method: 'PUT', body: JSON.stringify({ status_id: oppZiel }) });
      erledigt.opportunity = opp.pipeline_id === UPSELL_PIPELINE_ID ? `upsell_${a.oppStatus}` : a.oppStatus;
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
    const aktiv = await aktiveOpps(leadId);
    const { data: gewonnen } = await closeJson<{ data: Array<{ id: string; value: number | null }> }>(`/opportunity/?lead_id=${leadId}&status_type=won&_fields=id,value`);
    let opp: { id: string; value: number | null } | null = null;
    if (aktiv.length) {
      // Die jüngste aktive Opportunity ist der Abschluss
      const juengste = [...aktiv].sort((x, y) => y.date_created.localeCompare(x.date_created))[0];
      opp = { id: juengste.id, value: juengste.value ?? null };
      await closeJson(`/opportunity/${juengste.id}/`, { method: 'PUT', body: JSON.stringify({ status_id: zielStatusFuer(juengste, OPP_GEWONNEN) ?? OPP_GEWONNEN }) });
      erledigt.opportunity = juengste.pipeline_id === UPSELL_PIPELINE_ID ? 'upsell_gewonnen' : 'gewonnen';
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
  if (a.rueckruf) {
    // Nur anlegen, wenn es an dem Tag noch keine offene Rückruf-Aufgabe gibt (Protokoll-Korrekturen)
    const { data: offen } = await closeJson<{ data: Array<{ text: string; date: string | null }> }>(`/task/?lead_id=${leadId}&is_complete=false&_fields=text,date`);
    if (!offen.some((t) => t.date?.startsWith(a.rueckruf!.datum) && t.text.startsWith('📞 Rückruf'))) {
      await closeJson('/task/', { method: 'POST', body: JSON.stringify({ lead_id: leadId, ...(userId ? { assigned_to: userId } : {}), text: a.rueckruf.text, date: a.rueckruf.datum }) });
      erledigt.rueckruf = a.rueckruf.datum;
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
        : typ === 'setting'
          ? [SETTING_FELDER.ergebnis, SETTING_FELDER.kalender]
          : [TERMINIERUNG_FELDER.wenErreicht, TERMINIERUNG_FELDER.gatekeeperErgebnis, TERMINIERUNG_FELDER.ergebnis, TERMINIERUNG_FELDER.kalender];
  const schluessel = schluesselFelder.map((f) => felder[f] ?? '').join('|');

  let aktionen: Record<string, unknown> | null = null;
  const regeln = typ === 'terminierung' ? regelnTerminierung : typ === 'follow_up' ? regelnFollowUp : typ === 'closing' ? regelnClosing : typ === 'setting' ? regelnSetting : null;
  if (regeln && a.lead_id && (!alteAktionen || alteAktionen.schluessel !== schluessel)) {
    let plan = regeln(felder, jetzt);
    // Termin nur im Protokoll gelegt? → prüfen, ob er in Calendly steht (sonst keine Erinnerung an den Lead)
    const { istLeadTermin, planeTerminCheck } = await import('./termin-check');
    if (istLeadTermin(plan, jetzt)) {
      const art = typ === 'closing' && plan.oppStatus === 'cc2' ? 'CC2' : plan.closingTerminiert || typ === 'closing' ? 'Closing' : 'Setting';
      await planeTerminCheck(svc, a.lead_id, plan.termin!, art).catch((err) => console.error('[sales] Termin-Check nicht geplant:', err));
    }
    if (plan.freigabe) {
      const { istFreigegeben } = await import('@/lib/freigaben');
      if (!(await istFreigegeben(svc, plan.freigabe))) plan = {};
    }
    // Closing: nur „Abgeschlossen“ läuft immer – alles andere erst nach Freigabe (/admin/freigaben)
    if (typ === 'closing' && !plan.abgeschlossen && Object.keys(plan).length) {
      const { ladeFreigaben } = await import('@/lib/freigaben');
      const f = await ladeFreigaben(svc);
      if (!f.closing_ergebnisse) plan = {};
      else if (!f.angebot_nachfassen) plan = { ...plan, angebotNachfassen: false };
    }
    // Verlustgrund direkt aus dem Protokoll; Follow-up „Verloren“ setzt die Opportunity auf verloren (nur mit Freigabe)
    const grund = verlustgrundAusProtokoll(typ, felder);
    if (grund || (typ === 'follow_up' && (felder[FOLLOWUP_FELDER_IDS.ergebnis] ?? '').startsWith('Verloren'))) {
      const { istFreigegeben } = await import('@/lib/freigaben');
      if (await istFreigegeben(svc, 'verlustgrund_automatisch')) {
        plan = { ...plan, verlustgrund: grund, ...(typ === 'follow_up' && (felder[FOLLOWUP_FELDER_IDS.ergebnis] ?? '').startsWith('Verloren') ? { oppsVerloren: true } : {}) };
      }
    }
    aktionen = { ...(await fuehreAus(a.lead_id, plan, a.user_id)), schluessel };
    // Abschluss nachziehen: Analyse gewonnen, Auftragswert prüfen, Kunde anlegen (nur mit Freigabe)
    if (plan.abgeschlossen) {
      const { istFreigegeben } = await import('@/lib/freigaben');
      if (await istFreigegeben(svc, 'abschluss_nachziehen')) {
        const { zieheAbschlussNach } = await import('./abschluss');
        aktionen.abschluss = await zieheAbschlussNach(svc, a.lead_id, a.user_id).catch((err) => (console.error('[sales] Abschluss nachziehen:', err), { fehler: String(err) }));
      }
    }
    // Terminierung „Niemand / Mailbox“ → WhatsApp-Rückfrage planen (nur mit Freigabe nicht_erreicht_rueckfrage)
    if (typ === 'terminierung' && (felder[TERMINIERUNG_FELDER.wenErreicht] ?? '').startsWith('Niemand')) {
      const { planeNichtErreicht } = await import('./nicht-erreicht');
      aktionen.nichtErreichtWhatsapp = await planeNichtErreicht(svc, a.lead_id, jetzt).catch((err) => (console.error('[sales] Nicht-erreicht nicht geplant:', err), false));
    }
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
