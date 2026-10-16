/**
 * Termin-Format je Stelle (vom Kunden gewählt) und Vorstellungsrunden – reine Logik ohne DB.
 * - telefon / video / vor_ort: Einzelgespräch über die Wochen-Zeitfenster
 * - vorstellungsrunde: feste Gruppentermine vor Ort mit max. Teilnehmern
 */

import type { AppointmentType } from '@/lib/types/database';

export type TerminFormat = 'telefon' | 'video' | 'vor_ort' | 'vorstellungsrunde';

export const TERMIN_FORMATE: Array<{ value: TerminFormat; label: string }> = [
  { value: 'telefon', label: 'Einzelgespräch Telefon' },
  { value: 'video', label: 'Einzelgespräch Video' },
  { value: 'vor_ort', label: 'Einzelgespräch vor Ort' },
  { value: 'vorstellungsrunde', label: 'Vorstellungsrunde (Gruppe, vor Ort)' },
];

const ALLE = new Set<string>(TERMIN_FORMATE.map((f) => f.value));

export function istTerminFormat(wert: unknown): wert is TerminFormat {
  return typeof wert === 'string' && ALLE.has(wert);
}

/** Format einer Stelle; ohne gespeichertes Format (oder ohne Migration) aus appointment_type abgeleitet */
export function formatDerStelle(job: { termin_format?: string | null; appointment_type?: string | null } | null | undefined): TerminFormat {
  if (istTerminFormat(job?.termin_format)) return job!.termin_format as TerminFormat;
  if (job?.appointment_type === 'video') return 'video';
  if (job?.appointment_type === 'onsite') return 'vor_ort';
  return 'telefon';
}

/** appointment_type (bestehende Spalte) passend zum Format */
export function terminTypFuerFormat(format: TerminFormat): AppointmentType {
  if (format === 'video') return 'video';
  if (format === 'vor_ort' || format === 'vorstellungsrunde') return 'onsite';
  return 'call';
}

export const istVorOrt = (format: TerminFormat) => format === 'vor_ort' || format === 'vorstellungsrunde';

/** Vollständige Adresse für Nachrichten: „Musterstraße 1, 20095 Hamburg (Klingel Zoepp, 2. OG)“ */
export function vollstaendigeAdresse(adresse: string | null | undefined, hinweis?: string | null): string {
  const a = (adresse ?? '').replace(/\s*\n\s*/g, ', ').trim();
  const h = (hinweis ?? '').trim();
  if (!a) return h;
  return h ? `${a} (${h})` : a;
}

/** Standard-Adresse einer neuen Runde: Ort der Stelle, sonst Anschrift des Unternehmens */
export function standardAdresse(jobOrt: string | null | undefined, anschrift: string | null | undefined): string {
  const ort = (jobOrt ?? '').trim();
  if (ort && !/^https?:\/\//i.test(ort)) return ort;
  return (anschrift ?? '').replace(/\s*\n\s*/g, ', ').trim();
}

// ---------------------------------------------------------------------------
// Vorstellungsrunden: freie Plätze und Angebot an Bewerber
// ---------------------------------------------------------------------------

export interface Runde {
  id: string;
  starts_at: string;
  ends_at: string;
  adresse: string;
  hinweis: string | null;
  max_teilnehmer: number;
}

export interface RundenBuchung {
  vorstellungsrunde_id: string | null;
  status: string;
  application_id?: string | null;
}

const AKTIV = new Set(['booked', 'confirmed']);

/** Belegte Plätze je Runde (nur gebuchte/bestätigte Termine zählen) */
export function belegtePlaetze(buchungen: RundenBuchung[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of buchungen) {
    if (!b.vorstellungsrunde_id || !AKTIV.has(b.status)) continue;
    m.set(b.vorstellungsrunde_id, (m.get(b.vorstellungsrunde_id) ?? 0) + 1);
  }
  return m;
}

export function freiePlaetze(runde: Pick<Runde, 'id' | 'max_teilnehmer'>, belegt: Map<string, number>): number {
  return Math.max(0, runde.max_teilnehmer - (belegt.get(runde.id) ?? 0));
}

/** Mindestvorlauf wie bei Einzelslots: 2 Stunden */
export const RUNDE_VORLAUF_MS = 2 * 60 * 60_000;

/**
 * Runden, die einem Bewerber angeboten werden: anstehend (mind. 2 h Vorlauf), mit freiem Platz,
 * chronologisch. Die eigene aktive Buchung (beim Verschieben) zählt nicht als belegt.
 */
export function angeboteneRunden(
  runden: Runde[],
  buchungen: Array<RundenBuchung & { id?: string }>,
  opts: { jetzt?: Date; eigeneTerminId?: string; tage?: number } = {},
): Array<Runde & { freie_plaetze: number }> {
  const jetzt = (opts.jetzt ?? new Date()).getTime();
  const bis = jetzt + (opts.tage ?? 60) * 864e5;
  const belegt = belegtePlaetze(buchungen.filter((b) => !opts.eigeneTerminId || b.id !== opts.eigeneTerminId));
  return runden
    .filter((r) => {
      const start = new Date(r.starts_at).getTime();
      return Number.isFinite(start) && start >= jetzt + RUNDE_VORLAUF_MS && start <= bis;
    })
    .map((r) => ({ ...r, freie_plaetze: freiePlaetze(r, belegt) }))
    .filter((r) => r.freie_plaetze > 0)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

// ---------------------------------------------------------------------------
// WhatsApp-Variablen für Bestätigung und Erinnerungen
// ---------------------------------------------------------------------------

export const ORT_UNBEKANNT = 'wird noch mitgeteilt';

export interface TerminDaten {
  vorname: string;
  startsAt: Date;
  timezone: string;
  ort: string | null;
  firma: string;
}

export function datumUndUhrzeit(startsAt: Date, timezone: string): { datum: string; uhrzeit: string } {
  return {
    datum: startsAt.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', timeZone: timezone }),
    uhrzeit: startsAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: timezone }),
  };
}

/** Vorlagen der 24-h-Erinnerung in Reihenfolge der Wahl: vor Ort mit Adresse zuerst die Adress-Vorlage */
export function reminder24hVorlagen(termin: { type: string | null; location: string | null }): string[] {
  return termin.type === 'onsite' && (termin.location ?? '').trim()
    ? ['appointment_reminder_24h_ort', 'appointment_reminder_24h']
    : ['appointment_reminder_24h'];
}

/** Body-Variablen exakt in der Reihenfolge der jeweiligen Vorlage */
export function terminParameter(presetKey: string, d: TerminDaten): string[] {
  const { datum, uhrzeit } = datumUndUhrzeit(d.startsAt, d.timezone);
  const ort = (d.ort ?? '').trim() || ORT_UNBEKANNT;
  switch (presetKey) {
    case 'appointment_confirmation':
      return [d.vorname, datum, uhrzeit, ort];
    case 'appointment_reminder_24h_ort':
      return [d.vorname, datum, uhrzeit, d.firma || 'uns', ort];
    case 'appointment_reminder_2h':
      return [d.vorname, uhrzeit, ort];
    case 'appointment_reminder_24h':
    default:
      return [d.vorname, datum, uhrzeit];
  }
}

/** Fehlt die Migration (Tabelle/Spalte unbekannt)? Dann gilt das bisherige Verhalten. */
export function istSchemaFehler(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (['42P01', '42703', 'PGRST204', 'PGRST205', 'PGRST200'].includes(error.code ?? '')) return true;
  return /does not exist|could not find/i.test(error.message ?? '');
}

/** Lokales Datum + Uhrzeit (z. B. „2026-10-20“, „17:00“) in der Zeitzone des Kunden → UTC (DST-sicher) */
export function lokaleZeitAlsUtc(datum: string, uhrzeit: string, timezone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum ?? '');
  const t = /^(\d{2}):(\d{2})$/.exec((uhrzeit ?? '').slice(0, 5));
  if (!d || !t || Number(t[1]) > 23 || Number(t[2]) > 59) return null;
  const naiv = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  if (Number.isNaN(naiv)) return null;
  const versatz = (ms: number) => {
    const teile = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ms));
    const g = (typ: string) => Number(teile.find((p) => p.type === typ)?.value ?? 0);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(ms / 1000) * 1000;
  };
  let ms = naiv - versatz(naiv);
  ms = naiv - versatz(ms);
  return new Date(ms);
}
