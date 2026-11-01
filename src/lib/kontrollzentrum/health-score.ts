/**
 * Kunden-Health-Score (0–100) als Erweiterung des Kontrollzentrums.
 * Baut auf denselben geladenen Daten auf wie Ampel/Churn (laden.ts → baueZeilen) und ergänzt nur,
 * was dort fehlt (48-Std.-Anrufquote, offene Termine, Probetag-Stau, Prüfstand, Onboarding).
 * Zweck: Ausnahmeliste – ein Mitarbeiter betreut viele Kunden und schaut nur auf „kritisch“/„beobachten“.
 *
 * Rein und testbar: healthKennzahlen(), berechneHealthScore(), mitSnapshots().
 * Datenbank: speichereHealthSnapshots() schreibt täglich je aktivem Kunden einen Snapshot (kunden_health).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type HealthStufe = 'gut' | 'beobachten' | 'kritisch';

export type HealthBereich =
  | 'zufluss'
  | 'anruf48h'
  | 'erstkontakt'
  | 'login'
  | 'termine'
  | 'einstellungen'
  | 'pruefstand'
  | 'onboarding';

/** Gewichte (Summe 100). Jeder Bereich zieht anteilig (0–1) seines Gewichts ab. */
export const HEALTH_GEWICHTE: Record<HealthBereich, number> = {
  zufluss: 20,
  anruf48h: 15,
  erstkontakt: 10,
  login: 10,
  termine: 10,
  einstellungen: 15,
  pruefstand: 5,
  onboarding: 15,
};

/** Stufen-Grenzen: ab GUT „gut“, ab BEOBACHTEN „beobachten“, darunter „kritisch“ */
export const HEALTH_STUFEN = { GUT: 80, BEOBACHTEN: 60 } as const;

/** Schwellen der einzelnen Bereiche – bewusst an einer Stelle */
export const HEALTH_SCHWELLEN = {
  /** 48-Std.-Quote erst ab so vielen fälligen Bewerbern bewerten */
  MIN_BASIS_48H: 3,
  /** Median Erstkontakt erst ab so vielen Leads bewerten */
  MIN_LEADS_ERSTKONTAKT: 3,
  /** Offene Einladung zählt erst nach so vielen Tagen */
  EINLADUNG_TAGE: 3,
  /** Phase onboarding/zahlung länger als … Tage → hängt */
  ONBOARDING_TAGE: 7,
  /** Einstellungen erst bewerten, wenn die Kampagne so lange läuft */
  EINSTELLUNG_LAUFZEIT_TAGE: 30,
  /** Bewerber in der Probetag-Stufe länger als … Tage → ohne Ergebnis */
  PROBETAG_TAGE: 3,
} as const;

/** Phasen, in denen noch keine Bewerber kommen können (Kampagne läuft noch nicht) → kein Abzug für Zufluss/Einstellungen */
export const PHASEN_OHNE_ZUFLUSS = ['zahlung', 'onboarding', 'setup'];

export interface HealthKennzahlen {
  phase: string | null;
  /** Tage seit Beginn der aktuellen Phase (agencies.fulfillment_phase_seit), null = unbekannt */
  phaseSeitTagen: number | null;
  leads7: number;
  leads30: number;
  /** Soll je Woche aus agencies.settings.bewerber_soll_woche (optional) */
  sollWoche: number | null;
  /** Bewerber (30 Tage), die älter als 48 Std. und noch offen sind */
  basis48h: number;
  /** … davon ohne Anrufversuch (first_dial_at bzw. Anruf-Log) */
  ohneAnruf48h: number;
  ttfcMedianSek: number | null;
  /** Leads im 30-Tage-Fenster (Grundlage des Medians) */
  leadsErstkontakt: number;
  kundenNutzer: number;
  /** Tage seit letztem Login eines Kunden-Users, null = nie */
  tageSeitLogin: number | null;
  /** Login nur bewerten, wenn der Kunde die Cloud schon nutzen soll (gleiche Regel wie die Ampel) */
  loginPruefen: boolean;
  /** Gespräche/Probetage mit Status „geplant“ in der Vergangenheit */
  termineOhneErgebnis: number;
  /** Bewerber länger als PROBETAG_TAGE in der Probetag-Stufe */
  probetagHaengt: number;
  einstellungen30: number;
  /** Offene Prüfstand-Fälle mit Vorschlag = dieser Kunde */
  pruefstandOffen: number;
  /** Nicht eingelöste Einladungen, älter als EINLADUNG_TAGE */
  offeneEinladungen: number;
}

export interface HealthGrund {
  bereich: HealthBereich;
  text: string;
  /** Abgezogene Punkte */
  abzug: number;
}

export interface HealthErgebnis {
  score: number;
  stufe: HealthStufe;
  gruende: HealthGrund[];
}

const TAG = 864e5;

export function healthStufe(score: number): HealthStufe {
  if (score >= HEALTH_STUFEN.GUT) return 'gut';
  if (score >= HEALTH_STUFEN.BEOBACHTEN) return 'beobachten';
  return 'kritisch';
}

const std = (sek: number) => Math.round(sek / 3600);

/** Health-Score aus den Kennzahlen eines Kunden (rein). Nicht bewertbare Bereiche ziehen nichts ab. */
export function berechneHealthScore(k: HealthKennzahlen): HealthErgebnis {
  const S = HEALTH_SCHWELLEN;
  const gruende: HealthGrund[] = [];
  const abzug = (bereich: HealthBereich, anteil: number, text: string) => {
    const a = Math.min(1, Math.max(0, anteil));
    if (a <= 0) return;
    gruende.push({ bereich, text, abzug: Math.round(HEALTH_GEWICHTE[bereich] * a * 10) / 10 });
  };

  const zuflussErwartet = !PHASEN_OHNE_ZUFLUSS.includes(k.phase ?? '');

  // 1. Bewerber-Zufluss 7 Tage gegen Soll bzw. eigenen 30-Tage-Schnitt
  if (zuflussErwartet) {
    const schnitt = Math.round((k.leads30 / 30) * 7 * 10) / 10;
    const referenz = k.sollWoche ?? schnitt;
    const bezug = k.sollWoche !== null ? `Soll ${k.sollWoche}` : `Schnitt ${schnitt.toLocaleString('de-DE')}`;
    if (k.leads30 === 0 && k.sollWoche === null) abzug('zufluss', 1, 'Keine neuen Bewerber in 30 Tagen');
    else if (k.leads7 === 0) abzug('zufluss', referenz >= 1 ? 1 : 0.5, `Keine neuen Bewerber in 7 Tagen (${bezug}/Woche)`);
    else if (referenz > 0) {
      const q = k.leads7 / referenz;
      if (q < 0.5) abzug('zufluss', 0.7, `Nur ${k.leads7} Bewerber in 7 Tagen (${bezug}/Woche)`);
      else if (q < 0.8) abzug('zufluss', 0.4, `${k.leads7} Bewerber in 7 Tagen, unter ${bezug}/Woche`);
    }
  }

  // 2. Anteil Bewerber > 48 Std. ohne Anrufversuch
  if (k.basis48h >= S.MIN_BASIS_48H) {
    const q = k.ohneAnruf48h / k.basis48h;
    const p = Math.round(q * 100);
    const text = `${k.ohneAnruf48h} von ${k.basis48h} Bewerbern (${p} %) seit über 48 Std. ohne Anrufversuch`;
    if (q > 0.5) abzug('anruf48h', 1, text);
    else if (q > 0.25) abzug('anruf48h', 0.7, text);
    else if (q > 0.1) abzug('anruf48h', 0.4, text);
  }

  // 3. Median Zeit bis Erstkontakt
  if (k.ttfcMedianSek !== null && k.leadsErstkontakt >= S.MIN_LEADS_ERSTKONTAKT) {
    const h = k.ttfcMedianSek / 3600;
    const text = `Erstkontakt dauert im Median ${h < 1 ? `${Math.max(1, Math.round(k.ttfcMedianSek / 60))} Min.` : `${std(k.ttfcMedianSek)} Std.`}`;
    if (h > 48) abzug('erstkontakt', 1, text);
    else if (h > 24) abzug('erstkontakt', 0.75, text);
    else if (h > 4) abzug('erstkontakt', 0.5, text);
    else if (h > 1) abzug('erstkontakt', 0.25, text);
  }

  // 4. Letzter Login eines Kunden-Users (ohne Kunden-User → Bereich Onboarding)
  if (k.loginPruefen && k.kundenNutzer > 0) {
    const t = k.tageSeitLogin;
    if (t === null) abzug('login', 1, 'Kunde hat sich noch nie eingeloggt');
    else if (t > 30) abzug('login', 1, `Letzter Kunden-Login vor ${t} Tagen`);
    else if (t > 14) abzug('login', 0.6, `Letzter Kunden-Login vor ${t} Tagen`);
    else if (t > 7) abzug('login', 0.3, `Letzter Kunden-Login vor ${t} Tagen`);
  }

  // 5. Vergangene Gespräche/Probetage ohne Ergebnis + Probetag-Stau
  const offen = k.termineOhneErgebnis + k.probetagHaengt;
  if (offen > 0) {
    const teile: string[] = [];
    if (k.termineOhneErgebnis) teile.push(`${k.termineOhneErgebnis} ${k.termineOhneErgebnis === 1 ? 'vergangener Termin' : 'vergangene Termine'} ohne Ergebnis`);
    if (k.probetagHaengt) teile.push(`${k.probetagHaengt} Bewerber seit über ${S.PROBETAG_TAGE} Tagen in Probetag`);
    abzug('termine', offen >= 4 ? 1 : offen >= 2 ? 0.6 : 0.3, teile.join(', '));
  }

  // 6. Einstellungen in 30 Tagen (erst, wenn die Kampagne lange genug läuft)
  if (zuflussErwartet && (k.phaseSeitTagen === null || k.phaseSeitTagen >= S.EINSTELLUNG_LAUFZEIT_TAGE) && k.einstellungen30 === 0) {
    abzug('einstellungen', 1, 'Keine Einstellung in 30 Tagen');
  }

  // 7. Offene Prüfstand-Fälle für diesen Kunden
  if (k.pruefstandOffen > 0) {
    const n = k.pruefstandOffen;
    abzug('pruefstand', n > 5 ? 1 : n >= 3 ? 0.7 : 0.4, `${n} ${n === 1 ? 'Bewerber wartet' : 'Bewerber warten'} im Prüfstand auf Freigabe`);
  }

  // 8. Onboarding hängt
  {
    let a = 0;
    const teile: string[] = [];
    if (k.kundenNutzer === 0 && k.phase !== 'zahlung') {
      a += 0.6;
      teile.push('kein Kunden-User angelegt');
    }
    if (k.offeneEinladungen > 0) {
      a += 0.3;
      teile.push(`${k.offeneEinladungen} ${k.offeneEinladungen === 1 ? 'Einladung' : 'Einladungen'} nicht angenommen`);
    }
    if ((k.phase === 'onboarding' || k.phase === 'zahlung') && k.phaseSeitTagen !== null && k.phaseSeitTagen > S.ONBOARDING_TAGE) {
      a += 0.5;
      teile.push(`seit ${k.phaseSeitTagen} Tagen in Phase ${k.phase === 'zahlung' ? 'Zahlung' : 'Onboarding'}`);
    }
    if (a > 0) abzug('onboarding', a, `Onboarding hängt: ${teile.join(', ')}`);
  }

  gruende.sort((x, y) => y.abzug - x.abzug);
  const score = Math.max(0, Math.min(100, Math.round(100 - gruende.reduce((n, g) => n + g.abzug, 0))));
  return { score, stufe: healthStufe(score), gruende };
}

/** Rohdaten eines Kunden für healthKennzahlen() – alles aus dem Kontrollzentrum-Laden */
export interface HealthEingabe {
  phase: string | null;
  phaseSeit: string | null;
  settings: unknown;
  kandidaten: Array<{ id: string; created_at: string; first_dial_at?: string | null; current_stage_id?: string | null }>;
  /** Bewerber-IDs mit Anruf-Log */
  angerufen: Set<string>;
  /** Stufen „eingestellt“/„abgesagt“ – solche Bewerber brauchen keinen Anruf mehr */
  abgeschlossen: Set<string>;
  ttfcMedianSek: number | null;
  leads30: number;
  kundenNutzer: number;
  letzterLogin: string | null;
  loginPruefen: boolean;
  /** Zeitpunkte von Terminen mit Status „geplant“ in der Vergangenheit */
  offeneTermine: string[];
  /** Seit wann Bewerber in der Probetag-Stufe stehen */
  probetagSeit: string[];
  einstellungen30: number;
  pruefstandOffen: number;
  /** created_at nicht eingelöster Einladungen */
  einladungen: string[];
}

/** Soll je Woche aus agencies.settings (optional): bewerber_soll_woche */
export function liesSollWoche(settings: unknown): number | null {
  if (!settings || typeof settings !== 'object') return null;
  const v = (settings as Record<string, unknown>).bewerber_soll_woche;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

const tageSeit = (iso: string | null, jetzt: Date) => (iso ? Math.max(0, Math.floor((jetzt.getTime() - new Date(iso).getTime()) / TAG)) : null);

/** Kennzahlen für den Health-Score aus den geladenen Daten eines Kunden (rein) */
export function healthKennzahlen(e: HealthEingabe, jetzt: Date): HealthKennzahlen {
  const t = jetzt.getTime();
  const ab7 = new Date(t - 7 * TAG).toISOString();
  const ab30 = new Date(t - 30 * TAG).toISOString();
  const bis48 = new Date(t - 2 * TAG).toISOString();
  const probetagGrenze = new Date(t - HEALTH_SCHWELLEN.PROBETAG_TAGE * TAG).toISOString();
  const einladungGrenze = new Date(t - HEALTH_SCHWELLEN.EINLADUNG_TAGE * TAG).toISOString();
  const jetztIso = jetzt.toISOString();

  const faellig = e.kandidaten.filter(
    (k) => k.created_at >= ab30 && k.created_at < bis48 && !(k.current_stage_id && e.abgeschlossen.has(k.current_stage_id)),
  );
  return {
    phase: e.phase,
    phaseSeitTagen: tageSeit(e.phaseSeit, jetzt),
    leads7: e.kandidaten.filter((k) => k.created_at >= ab7 && k.created_at <= jetztIso).length,
    leads30: e.leads30,
    sollWoche: liesSollWoche(e.settings),
    basis48h: faellig.length,
    ohneAnruf48h: faellig.filter((k) => !k.first_dial_at && !e.angerufen.has(k.id)).length,
    ttfcMedianSek: e.ttfcMedianSek,
    leadsErstkontakt: e.leads30,
    kundenNutzer: e.kundenNutzer,
    tageSeitLogin: tageSeit(e.letzterLogin, jetzt),
    loginPruefen: e.loginPruefen,
    termineOhneErgebnis: e.offeneTermine.filter((d) => d < jetztIso).length,
    probetagHaengt: e.probetagSeit.filter((d) => d < probetagGrenze).length,
    einstellungen30: e.einstellungen30,
    pruefstandOffen: e.pruefstandOffen,
    offeneEinladungen: e.einladungen.filter((d) => d < einladungGrenze).length,
  };
}

/** Health-Anzeige im Kontrollzentrum: Snapshot von heute (sonst live) + Trend gegen vor 7 Tagen */
export interface HealthAnzeige extends HealthErgebnis {
  kennzahlen: HealthKennzahlen;
  /** Score vor 7 Tagen (Snapshot), null = keiner vorhanden */
  vor7: number | null;
  /** score − vor7 */
  trend: number | null;
  quelle: 'snapshot' | 'live';
}

export interface HealthSnapshot {
  agency_id: string;
  datum: string;
  score: number;
  stufe: HealthStufe;
  gruende: HealthGrund[];
  kennzahlen: HealthKennzahlen;
}

/** Datum (YYYY-MM-DD) n Tage vor `datum` */
export function tageVor(datum: string, n: number): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Snapshots einmischen (rein): Gibt es einen von heute, gilt er; sonst bleibt die Live-Berechnung.
 * Vergleichswert = jüngster Snapshot, der mindestens 7 Tage alt ist (höchstens 10 Tage, falls ein Lauf fehlte).
 */
export function mitSnapshots<Z extends { id: string; health: HealthAnzeige | null }>(zeilen: Z[], snapshots: HealthSnapshot[], heute: string): Z[] {
  const grenze7 = tageVor(heute, 7);
  const grenze10 = tageVor(heute, 10);
  const heuteMap = new Map<string, HealthSnapshot>();
  const vorMap = new Map<string, HealthSnapshot>();
  for (const s of snapshots) {
    if (s.datum === heute) heuteMap.set(s.agency_id, s);
    else if (s.datum <= grenze7 && s.datum >= grenze10) {
      const alt = vorMap.get(s.agency_id);
      if (!alt || s.datum > alt.datum) vorMap.set(s.agency_id, s);
    }
  }
  return zeilen.map((z) => {
    if (!z.health) return z;
    const h = heuteMap.get(z.id);
    const basis: HealthAnzeige = h
      ? { score: h.score, stufe: h.stufe, gruende: h.gruende ?? [], kennzahlen: h.kennzahlen, vor7: null, trend: null, quelle: 'snapshot' }
      : z.health;
    const vor7 = vorMap.get(z.id)?.score ?? null;
    return { ...z, health: { ...basis, vor7, trend: vor7 === null ? null : basis.score - vor7 } };
  });
}

/** Snapshots der letzten 10 Tage laden (Tabelle fehlt noch → leer, Fehler wird geloggt) */
export async function ladeHealthSnapshots(svc: SupabaseClient, heute: string): Promise<HealthSnapshot[]> {
  const { data, error } = await svc
    .from('kunden_health')
    .select('agency_id, datum, score, stufe, gruende, kennzahlen')
    .gte('datum', tageVor(heute, 10))
    .lte('datum', heute)
    .order('datum')
    .limit(5000);
  if (error) {
    console.error('[kontrollzentrum] Health-Snapshots konnten nicht geladen werden:', error.message);
    return [];
  }
  return (data ?? []) as HealthSnapshot[];
}

/**
 * Täglicher Snapshot je aktivem Kunden (nicht pausiert, nicht in Offboarding/beendet) für `heute`.
 * Upsert auf (agency_id, datum) – ein zweiter Lauf am selben Tag überschreibt. Fehler werden geworfen.
 */
export async function speichereHealthSnapshots(svc: SupabaseClient, jetzt: Date = new Date()): Promise<{ gespeichert: number; datum: string }> {
  // Dynamisch, damit die reinen Funktionen ohne Datenbank-Module testbar bleiben (und kein Import-Kreis entsteht)
  const { ladeRohdaten, baueZeilen } = await import('./laden');
  const { today } = await import('@/lib/fulfillment/views');
  const heute = today(jetzt);
  const zeilen = baueZeilen(await ladeRohdaten(svc, jetzt), jetzt);

  const rows = zeilen
    .filter((z) => z.health)
    .map((z) => ({
      agency_id: z.id,
      datum: heute,
      score: z.health!.score,
      stufe: z.health!.stufe,
      gruende: z.health!.gruende,
      kennzahlen: z.health!.kennzahlen,
    }));
  if (!rows.length) return { gespeichert: 0, datum: heute };
  const { error } = await svc.from('kunden_health').upsert(rows, { onConflict: 'agency_id,datum' });
  if (error) throw new Error(`kunden_health: ${error.message}`);
  return { gespeichert: rows.length, datum: heute };
}
