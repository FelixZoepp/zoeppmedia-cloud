/**
 * Anruf-Modus wie Close: Rückruf mit Datum UND Uhrzeit – ohne neue Spalte.
 * call_logs.next_contact_date bleibt ein Datum; die Uhrzeit steht als fester Vorsatz in den Notizen
 * („Rückruf um 14:30 Uhr · …“). So bleibt sie lesbar und die Warteschlange kann bis dahin ausblenden.
 */

import { berlinUhrzeit } from '@/lib/zeit/berlin';

const ZEIT = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;
const VORSATZ = /^Rückruf um ([01]\d|2[0-3]):([0-5]\d) Uhr/;

/** 'HH:MM' prüfen, sonst null */
export function gueltigeZeit(zeit: unknown): string | null {
  return typeof zeit === 'string' && ZEIT.test(zeit) ? zeit : null;
}

/** datetime-local ('2026-10-16T14:30') in Datum + Uhrzeit zerlegen */
export function zerlegeRueckruf(wert: string): { datum: string; zeit: string } | null {
  const [datum, zeit] = wert.split('T');
  if (!datum || !DATUM.test(datum)) return null;
  const z = gueltigeZeit(zeit?.slice(0, 5));
  return z ? { datum, zeit: z } : null;
}

/** Notiz mit Uhrzeit-Vorsatz – ohne Uhrzeit bleibt die Notiz unverändert */
export function rueckrufNotiz(zeit: string | null, notiz: string | null): string | null {
  const z = gueltigeZeit(zeit);
  const n = notiz?.trim() || null;
  if (!z) return n;
  return n ? `Rückruf um ${z} Uhr · ${n}` : `Rückruf um ${z} Uhr`;
}

/** Uhrzeit aus dem Notiz-Vorsatz lesen */
export function rueckrufZeit(notes: string | null | undefined): string | null {
  const m = notes ? VORSATZ.exec(notes) : null;
  return m ? `${m[1]}:${m[2]}` : null;
}

/** Zeitpunkt des Rückrufs (Berliner Zeit); ohne Uhrzeit 00:00 = ganzer Tag fällig */
export function rueckrufZeitpunkt(datum: string, zeit: string | null): Date | null {
  const d = DATUM.exec(datum);
  if (!d) return null;
  const [h, min] = (gueltigeZeit(zeit) ?? '00:00').split(':').map(Number);
  return berlinUhrzeit(Number(d[1]), Number(d[2]), Number(d[3]), h, min);
}

/** Ist der Rückruf jetzt fällig? Ohne Datum oder ohne Uhrzeit: wie bisher (tagesgenau) */
export function rueckrufFaellig(cb: { next_contact_date: string | null; notes: string | null }, jetzt: Date): boolean {
  if (!cb.next_contact_date) return true;
  const t = rueckrufZeitpunkt(cb.next_contact_date, rueckrufZeit(cb.notes));
  return !t || t.getTime() <= jetzt.getTime();
}

/** Interne Aufgabe für den Rückruf (wie die Kadenz-Aufgaben in internal_tasks) */
export function rueckrufAufgabe(input: {
  name: string;
  agencyId: string;
  datum: string;
  zeit: string | null;
  notiz: string | null;
}) {
  const z = gueltigeZeit(input.zeit);
  const n = input.notiz?.trim();
  return {
    title: `Rückruf${z ? ` ${z} Uhr` : ''} — ${input.name}`,
    description: [`Rückruf gewünscht${z ? ` um ${z} Uhr` : ''}.`, n ? `Notiz aus dem Anruf: ${n}` : null].filter(Boolean).join(' '),
    agency_id: input.agencyId,
    status: 'todo' as const,
    priority: 'high' as const,
    due_date: input.datum,
    created_by: null,
  };
}
