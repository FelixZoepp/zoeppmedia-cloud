/**
 * „5 - Gesprächsprotokoll (Upsell)“: Gespräche mit Bestandskunden über Verlängerung, Upgrade, mehr Stellen.
 * Felder legt die Einrichtung an (close.einrichtung 'upsell_protokoll'); Typ- und Feld-IDs stehen danach in
 * system_einstellungen.close_upsell_protokoll. Nach dem Speichern setzt die Cloud den Deal in der Pipeline
 * „Upsell (Bestandskunden)“ (Stufe, Abschlusschance, Wert) und legt Aufgaben an.
 * Der Lead bleibt immer „Kunde“. Keine Nachricht an den Kunden.
 * „Abgeschlossen“ läuft immer, alles andere nur mit Freigabe „upsell_protokoll“.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeldSoll } from './close-einrichtung';
import { UPSELL_FILTER, UPSELL_PIPELINE_ID, UPSELL_STATUS } from './pipelines';
import { VERLUSTGRUENDE, VERLUSTGRUND_FELD } from './close-aufraeumen';

export const UPSELL_PROTOKOLL_NAME = '5 - Gesprächsprotokoll (Upsell)';
export const UPSELL_KONFIG_KEY = 'close_upsell_protokoll';
const TAG = 864e5;
const LEAD_FELD_GESPERRT_BIS = 'cf_ivdENLjTV0OBF9z2It0W5CikYZMBZbE54BgcbINdO9S';

export const UPSELL_ERGEBNISSE = [
  'Strategietermin gelegt',
  'Konzepttermin gelegt',
  'Entscheidungstermin gelegt',
  'Abgeschlossen',
  'Verschoben',
  'Kein Potenzial jetzt',
  'Verloren',
] as const;

export const UPSELL_FELDER: FeldSoll[] = [
  { key: 'art', name: 'Art', typ: 'choices', choices: ['Potenzial-Check', 'Strategietermin', 'Konzept-Präsentation', 'Entscheidung'] },
  { key: 'erreicht', name: '📞 Erreicht?', typ: 'choices', choices: ['Ja', 'Nein / Mailbox', 'No-Show'] },
  { key: 'zufrieden', name: 'Kunde zufrieden?', typ: 'choices', choices: ['Sehr (Ergebnisse top)', 'Okay', 'Unzufrieden'] },
  { key: 'ergebnisseKunde', name: 'Ergebnisse aktuell (Bewerber / Einstellungen)', typ: 'text' },
  { key: 'upsellArt', name: 'Upsell-Art', typ: 'choices', choices: ['Verlängerung', 'Paket-Upgrade', 'Mehr Stellen / Standorte', 'Neues Produkt'] },
  { key: 'wert', name: 'Geschätzter Auftragswert (€)', typ: 'number' },
  { key: 'wertArt', name: 'Wert ist', typ: 'choices', choices: ['Einmalig', 'Monatlich'] },
  { key: 'entscheider', name: 'Alle Entscheider dabei?', typ: 'choices', choices: ['Ja', 'Nein'] },
  {
    key: 'einwand',
    name: 'Einwand',
    typ: 'choices',
    choices: ['Budget', 'Entscheider fehlt', 'Zeitpunkt', 'Ergebnisse noch zu schwach', 'Will Angebot per Mail', 'Kein Bedarf mehr', 'Sonstiges'],
  },
  { key: 'ergebnis', name: '✅ Ergebnis', typ: 'choices', choices: [...UPSELL_ERGEBNISSE] },
  { key: 'verlorenGrund', name: 'Verloren-Grund', typ: 'choices', choices: [...VERLUSTGRUENDE] },
  { key: 'kalender', name: '📅 Kalender (nächster Termin / Wiedervorlage)', typ: 'datetime' },
  { key: 'notizen', name: 'Notizen', typ: 'textarea' },
];

export interface UpsellKonfig {
  typ: string;
  felder: Record<string, string>;
}

export async function ladeUpsellKonfig(svc: SupabaseClient): Promise<UpsellKonfig | null> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', UPSELL_KONFIG_KEY).maybeSingle();
  const w = (data as { wert: string } | null)?.wert;
  try {
    return w ? (JSON.parse(w) as UpsellKonfig) : null;
  } catch {
    return null;
  }
}

/** Protokoll-Werte nach Schlüssel (art, ergebnis …) statt Close-Feld-ID */
export function werteNachSchluessel(felder: Record<string, string | null>, k: UpsellKonfig): Record<string, string | null> {
  return Object.fromEntries(Object.entries(k.felder).map(([key, id]) => [key, felder[id] ?? null]));
}

/* ── Regeln (rein, testbar) ───────────────────────────────────── */

export interface UpsellPlan {
  /** Deal-Stufe in der Upsell-Pipeline; null = Stufe bleibt */
  stufe?: keyof typeof UPSELL_STATUS | null;
  chance?: number;
  /** Auftragswert in € + Periode */
  wert?: { euro: number; monatlich: boolean };
  /** keinen Deal? → anlegen (nur bei „… gelegt“ / Abgeschlossen) */
  neuAnlegen?: boolean;
  verlustgrund?: string | null;
  gesperrtBis?: string | null;
  sperreAufheben?: boolean;
  aufgaben: Array<{ text: string; datum: string }>;
  /** läuft auch ohne Freigabe */
  abgeschlossen?: boolean;
}

const tag = (d: Date) => d.toISOString().slice(0, 10);
const ab = (s: string | null | undefined, praefix: string) => (s ?? '').startsWith(praefix);

export function regelnUpsell(w: Record<string, string | null>, jetzt: Date, firma = 'Kunde'): UpsellPlan {
  const ergebnis = w.ergebnis ?? '';
  const erreicht = w.erreicht ?? '';
  const kalender = w.kalender && new Date(w.kalender).getTime() > jetzt.getTime() ? new Date(w.kalender).toISOString() : null;
  const heute = tag(jetzt);
  const morgen = new Date(jetzt.getTime() + TAG).toISOString();
  const euro = Number(String(w.wert ?? '').replace(',', '.'));
  const wert = euro > 0 ? { euro: Math.round(euro), monatlich: ab(w.wertArt, 'Monat') } : undefined;
  const entscheiderFehlt = ab(w.entscheider, 'Nein');
  const plan: UpsellPlan = { aufgaben: [], ...(wert ? { wert } : {}) };

  if (ab(w.zufrieden, 'Unzufrieden')) {
    plan.aufgaben.push({ text: `⚠️ ${firma} ist unzufrieden: Ergebnisse mit dem Fulfillment klären – erst Lösung, dann Upsell`, datum: heute });
  }

  if (ab(erreicht, 'Nein')) return { ...plan, gesperrtBis: kalender ?? morgen };
  if (ab(erreicht, 'No-Show')) return { ...plan, aufgaben: [...plan.aufgaben, { text: `📅 Upsell No-Show (${firma}): neuen Termin legen`, datum: heute }] };

  if (ergebnis.startsWith('Strategietermin')) return { ...plan, stufe: 'strategietermin', chance: 25, neuAnlegen: true };
  if (ergebnis.startsWith('Konzepttermin')) return { ...plan, stufe: 'konzept', chance: 40, neuAnlegen: true };
  if (ergebnis.startsWith('Entscheidungstermin')) {
    return {
      ...plan,
      stufe: 'entscheidung',
      chance: entscheiderFehlt ? 45 : 60,
      neuAnlegen: true,
      aufgaben: entscheiderFehlt ? [...plan.aufgaben, { text: `👥 Upsell ${firma}: fehlende Entscheider in den Entscheidungstermin holen`, datum: heute }] : plan.aufgaben,
    };
  }
  if (ergebnis.startsWith('Abgeschlossen')) {
    return {
      ...plan,
      stufe: 'gewonnen',
      chance: 100,
      neuAnlegen: true,
      abgeschlossen: true,
      sperreAufheben: true,
      aufgaben: wert ? plan.aufgaben : [...plan.aufgaben, { text: `💰 Upsell ${firma}: Auftragswert in den Deal eintragen`, datum: heute }],
    };
  }
  if (ergebnis.startsWith('Verschoben')) {
    return { ...plan, stufe: null, aufgaben: kalender ? plan.aufgaben : [...plan.aufgaben, { text: `📅 Upsell ${firma}: neuen Termin legen`, datum: heute }] };
  }
  if (ergebnis.startsWith('Kein Potenzial')) {
    const wiedervorlage = kalender ?? new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth() + 3, jetzt.getUTCDate(), 8)).toISOString();
    return {
      ...plan,
      stufe: 'verloren',
      gesperrtBis: wiedervorlage,
      aufgaben: [...plan.aufgaben, { text: `🔁 Upsell-Potenzial bei ${firma} erneut prüfen`, datum: tag(new Date(wiedervorlage)) }],
    };
  }
  if (ergebnis.startsWith('Verloren')) return { ...plan, stufe: 'verloren', verlustgrund: w.verlorenGrund ?? null, ...(kalender ? { gesperrtBis: kalender } : {}) };
  return plan;
}

/* ── Ausführen in Close ───────────────────────────────────────── */

function closeHeaders(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}`, 'Content-Type': 'application/json' };
}

async function close<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.close.com/api/v1${path}`, { ...init, headers: closeHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status} bei ${path.split('?')[0]}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export async function fuehreUpsellAus(leadId: string, plan: UpsellPlan, userId: string | null, art: string | null): Promise<Record<string, unknown>> {
  const erledigt: Record<string, unknown> = {};
  const deal: Record<string, unknown> = {};
  if (plan.stufe) deal.status_id = UPSELL_STATUS[plan.stufe];
  if (plan.chance !== undefined) deal.confidence = plan.chance;
  if (plan.wert) {
    deal.value = plan.wert.euro * 100;
    deal.value_period = plan.wert.monatlich ? 'monthly' : 'one_time';
  }
  if (plan.verlustgrund && (VERLUSTGRUENDE as readonly string[]).includes(plan.verlustgrund)) deal[`custom.${VERLUSTGRUND_FELD}`] = plan.verlustgrund;

  if (Object.keys(deal).length) {
    const { data } = await close<{ data: Array<{ id: string; date_created: string }> }>(
      `/opportunity/?lead_id=${leadId}&${UPSELL_FILTER}&status_type=active&_fields=id,date_created`,
    );
    const offen = [...data].sort((a, b) => b.date_created.localeCompare(a.date_created))[0];
    if (offen) {
      await close(`/opportunity/${offen.id}/`, { method: 'PUT', body: JSON.stringify(deal) });
      erledigt.deal = `aktualisiert (${plan.stufe ?? 'Stufe bleibt'})`;
    } else if (plan.neuAnlegen && plan.stufe) {
      await close('/opportunity/', {
        method: 'POST',
        body: JSON.stringify({ lead_id: leadId, pipeline_id: UPSELL_PIPELINE_ID, ...deal, note: `Upsell laut Protokoll${art ? `: ${art}` : ''}`, ...(userId ? { user_id: userId } : {}) }),
      });
      erledigt.deal = `angelegt (${plan.stufe})`;
    } else {
      erledigt.deal = 'kein offener Upsell-Deal';
    }
  }

  if (plan.gesperrtBis || plan.sperreAufheben) {
    await close(`/lead/${leadId}/`, { method: 'PUT', body: JSON.stringify({ [`custom.${LEAD_FELD_GESPERRT_BIS}`]: plan.sperreAufheben ? null : plan.gesperrtBis }) });
    erledigt.gesperrtBis = plan.sperreAufheben ? null : plan.gesperrtBis;
  }

  if (plan.aufgaben.length) {
    const offen = await close<{ data: Array<{ text: string }> }>(`/task/?lead_id=${leadId}&is_complete=false&_limit=50&_fields=text`).catch(() => ({ data: [] }));
    let n = 0;
    for (const t of plan.aufgaben) {
      if (offen.data.some((x) => x.text === t.text)) continue;
      await close('/task/', { method: 'POST', body: JSON.stringify({ lead_id: leadId, ...(userId ? { assigned_to: userId } : {}), text: t.text, date: t.datum }) });
      n++;
    }
    erledigt.aufgaben = n;
  }
  return erledigt;
}

/** Aus verarbeiteProtokoll: Regeln anwenden (Freigabe beachten) */
export async function setzeUpsellProtokollUm(
  svc: SupabaseClient,
  k: UpsellKonfig,
  a: { lead_id: string; user_id: string | null; felder: Record<string, string | null> },
  jetzt: Date,
): Promise<Record<string, unknown>> {
  const w = werteNachSchluessel(a.felder, k);
  const lead = await close<{ display_name?: string }>(`/lead/${a.lead_id}/?_fields=display_name`).catch(() => ({ display_name: undefined }));
  let plan = regelnUpsell(w, jetzt, lead.display_name ?? 'Kunde');
  if (!plan.abgeschlossen) {
    const { istFreigegeben } = await import('@/lib/freigaben');
    if (!(await istFreigegeben(svc, 'upsell_protokoll'))) plan = { aufgaben: [] };
  }
  return fuehreUpsellAus(a.lead_id, plan, a.user_id, w.art);
}
