/**
 * „Dein Fahrplan“ im Kundenportal: alle Schritte bis zum Kampagnenstart, wer dran ist, voraussichtlicher Start.
 *
 * Neutral für uns: Eigene Schritte zeigen nie „überfällig“ – ohne gültiges Datum steht nur „in Arbeit“.
 * Kunden-Schritte mit abgelaufener Frist werden freundlich (gelb) markiert.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { stepsForKunde, type Phase, type StepDef } from './catalog';
import { ensureFulfillment, type ClientStepRow } from './engine';
import { bausteineVon, type Baustein } from './pakete';
import { today } from './views';

/** Kundenfreundliche Titel für unsere Schritte; nicht aufgeführte interne Schritte werden nicht gezeigt */
const UNSERE_SCHRITTE: Record<string, string> = {
  z_vertrag: 'Vertrag unterschrieben',
  z_zahlung_setup: 'Startzahlung eingegangen',
  o_kickoff: 'Kick-off-Meeting',
  o_zugaenge_geprueft: 'Wir prüfen alle Zugänge',
  s_ideen: 'Ad-Ideen und Skripte',
  s_grafiken: 'Grafiken für deine Anzeigen',
  s_funnel: 'Bewerbungs-Funnel',
  s_indeed_anzeige: 'Indeed-Anzeige',
  s_innendienst: 'Innendienst-Team eingeteilt',
  s_werbemanager: 'Werbekonto eingerichtet',
  s_ads_vorbereitet: 'Anzeigen fertig vorbereitet',
  s_testlead: 'Test-Bewerbung durchgespielt',
  s_starttermin: 'Starttermin festgelegt',
  s_launch: 'Kampagne geht live',
};

export const FAHRPLAN_PHASEN: Array<{ key: Phase; label: string }> = [
  { key: 'zahlung', label: 'Start' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'setup', label: 'Aufbau' },
  { key: 'continuity', label: 'Kampagne läuft' },
];
const REIHENFOLGE: Phase[] = ['zahlung', 'onboarding', 'setup', 'continuity', 'offboarding', 'beendet'];

export type SchrittStatus = 'erledigt' | 'du' | 'pruefung' | 'in_arbeit' | 'geplant';

export interface FahrplanSchritt {
  key: string;
  titel: string;
  wer: 'kunde' | 'zoepp';
  status: SchrittStatus;
  /** Kunde: Frist; wir: geplantes Datum (nur wenn nicht in der Vergangenheit) */
  datum: string | null;
  /** Nur Kunden-Schritte: Frist abgelaufen */
  faellig: boolean;
}

export interface Fahrplan {
  phase: Phase;
  fortschritt: number;
  erledigt: number;
  gesamt: number;
  ball: { wer: 'kunde' | 'zoepp' | null; text: string };
  live: boolean;
  /** Voraussichtlicher Kampagnenstart (YYYY-MM-DD) */
  startDatum: string | null;
  phasen: Array<{ key: Phase; label: string; status: 'fertig' | 'aktiv' | 'kommt'; schritte: FahrplanSchritt[] }>;
}

const OFFEN = ['offen', 'in_arbeit'];

function plusTage(datum: string, tage: number): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

const titelVon = (def: StepDef | undefined, key: string, wer: 'kunde' | 'zoepp') =>
  wer === 'zoepp' ? UNSERE_SCHRITTE[key] ?? null : def?.titel ?? key;

/** Rein, testbar: Fahrplan aus den Schritt-Zeilen des Kunden */
export function baueFahrplan(input: {
  phase: Phase;
  rows: Pick<ClientStepRow, 'step_key' | 'phase' | 'wer' | 'status' | 'faellig_am'>[];
  bausteine: Baustein[];
  /** Ads warten auf Freigabe durch den Kunden */
  freigabenOffen: number;
  heute: string;
}): Fahrplan {
  const { phase, rows, bausteine, heute } = input;
  const aktIdx = REIHENFOLGE.indexOf(phase);
  const live = aktIdx >= REIHENFOLGE.indexOf('continuity');
  const nachKey = new Map(rows.map((r) => [r.step_key, r]));

  const phasen = FAHRPLAN_PHASEN.map((p) => {
    const idx = REIHENFOLGE.indexOf(p.key);
    const status: 'fertig' | 'aktiv' | 'kommt' = idx < aktIdx ? 'fertig' : idx === aktIdx ? 'aktiv' : 'kommt';
    // Continuity: nur Kunden-Schritte (Testimonial), keine internen Kontrollen
    const defs = stepsForKunde(p.key, bausteine).filter((d) => (p.key === 'continuity' ? d.wer === 'kunde' : true));
    const schritte: FahrplanSchritt[] = [];
    for (const def of defs) {
      const titel = titelVon(def, def.key, def.wer);
      if (!titel) continue;
      const row = nachKey.get(def.key);
      if (row?.status === 'nicht_noetig') continue;
      if (!row) {
        schritte.push({ key: def.key, titel, wer: def.wer, status: status === 'fertig' ? 'erledigt' : 'geplant', datum: null, faellig: false });
        continue;
      }
      if (row.status === 'erledigt') {
        schritte.push({ key: def.key, titel, wer: def.wer, status: 'erledigt', datum: null, faellig: false });
      } else if (row.status === 'zur_pruefung') {
        schritte.push({ key: def.key, titel, wer: def.wer, status: 'pruefung', datum: null, faellig: false });
      } else if (def.wer === 'kunde') {
        // Freigabe geht erst, wenn Anzeigen bereitstehen – vorher planen wir
        const bereit = def.key !== 's_freigabe' || input.freigabenOffen > 0;
        schritte.push({
          key: def.key,
          titel,
          wer: 'kunde',
          status: bereit ? 'du' : 'geplant',
          datum: bereit ? row.faellig_am : null,
          faellig: bereit && !!row.faellig_am && row.faellig_am < heute,
        });
      } else {
        schritte.push({ key: def.key, titel, wer: 'zoepp', status: 'in_arbeit', datum: row.faellig_am && row.faellig_am >= heute ? row.faellig_am : null, faellig: false });
      }
    }
    return { key: p.key, label: p.label, status, schritte };
  });

  // Fortschritt bis zum Start (ohne „Kampagne läuft“)
  const bisStart = phasen.filter((p) => p.key !== 'continuity').flatMap((p) => p.schritte);
  const erledigt = live ? bisStart.length : bisStart.filter((s) => s.status === 'erledigt').length;
  const gesamt = bisStart.length;

  // Wer ist dran? Offene Kunden-Aufgaben der aktuellen Phase zuerst
  const aktiv = phasen.find((p) => p.status === 'aktiv');
  const duOffen = aktiv?.schritte.filter((s) => s.status === 'du') ?? [];
  const wir = aktiv?.schritte.filter((s) => s.status === 'in_arbeit' || s.status === 'pruefung') ?? [];
  let ball: Fahrplan['ball'];
  if (live) ball = { wer: null, text: 'Deine Kampagne läuft. Neue Bewerber findest du unter „Bewerber“.' };
  else if (duOffen.length)
    ball = {
      wer: 'kunde',
      text: `Wir brauchen noch ${duOffen.length === 1 ? 'eine Sache' : `${duOffen.length} Dinge`} von dir: ${duOffen
        .slice(0, 2)
        .map((s) => s.titel)
        .join(', ')}${duOffen.length > 2 ? ' …' : ''}`,
    };
  else if (wir.length) {
    const naechster = wir.find((s) => s.status === 'in_arbeit') ?? wir[0];
    ball = { wer: 'zoepp', text: `Wir sind dran: ${naechster.titel}${naechster.datum ? `, geplant bis ${kurz(naechster.datum)}` : ''}. Für dich gibt es gerade nichts zu tun.` };
  } else ball = { wer: 'zoepp', text: 'Wir bereiten den nächsten Schritt vor. Für dich gibt es gerade nichts zu tun.' };

  return {
    phase,
    fortschritt: gesamt ? Math.round((erledigt / gesamt) * 100) : 0,
    erledigt,
    gesamt,
    ball,
    live,
    startDatum: live ? null : schaetzeStart(phase, rows, bausteine, heute),
    phasen,
  };
}

/** Voraussichtlicher Start: Ende der laufenden Phase (nie vor heute) + Dauer der folgenden Phasen bis „Kampagne live“ */
export function schaetzeStart(phase: Phase, rows: Pick<ClientStepRow, 'step_key' | 'phase' | 'status' | 'faellig_am'>[], bausteine: Baustein[], heute: string): string {
  const launch = rows.find((r) => r.step_key === 's_launch' && OFFEN.includes(r.status));
  if (launch?.faellig_am) return launch.faellig_am >= heute ? launch.faellig_am : plusTage(heute, 2);
  let ende = heute;
  for (const r of rows) if (r.phase === phase && OFFEN.includes(r.status) && r.faellig_am && r.faellig_am > ende) ende = r.faellig_am;
  const folgend: Phase[] = phase === 'zahlung' ? ['onboarding', 'setup'] : phase === 'onboarding' ? ['setup'] : [];
  for (const p of folgend) {
    const dauer = Math.max(0, ...stepsForKunde(p, bausteine).map((d) => d.frist_tage));
    ende = plusTage(ende, dauer);
  }
  return ende;
}

const kurz = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });

export async function ladeFahrplan(svc: SupabaseClient, agencyId: string, now: Date = new Date()): Promise<Fahrplan> {
  const phase = await ensureFulfillment(svc, agencyId, now);
  const [{ data: rows }, { data: ag }, { count }] = await Promise.all([
    svc.from('client_steps').select('step_key, phase, wer, status, faellig_am').eq('agency_id', agencyId),
    svc.from('agencies').select('bausteine').eq('id', agencyId).maybeSingle(),
    svc.from('ad_items').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId).eq('stage', 'freigabe_kunde'),
  ]);
  return baueFahrplan({
    phase,
    rows: (rows ?? []) as ClientStepRow[],
    bausteine: bausteineVon((ag as { bausteine?: unknown } | null)?.bausteine),
    freigabenOffen: count ?? 0,
    heute: today(now),
  });
}

