/**
 * Pakete und Leistungs-Bausteine eines Kunden.
 *
 * Das Paket bestimmt Preis und Laufzeit, die Bausteine bestimmen, was wir liefern –
 * und damit, welche Fulfillment-Schritte beim Kunden angelegt werden.
 * Cloud-Zugang, Masterclass (Skripte & Recruiting-Prozess) und Testimonial gibt es immer.
 *
 * Rein (keine I/O), auch im Browser nutzbar.
 */

export type Baustein = 'indeed' | 'meta' | 'innendienst';

export const BAUSTEINE: Array<{ key: Baustein; label: string; hinweis: string }> = [
  { key: 'indeed', label: 'Indeed', hinweis: 'Indeed-Anzeige erstellen, schalten und betreuen' },
  { key: 'meta', label: 'Funnel + Meta-Ads', hinweis: 'Perspective-Funnel, Grafiken/Videos, Werbemanager' },
  { key: 'innendienst', label: 'Innendienst', hinweis: 'Wir bearbeiten die Bewerber in der Cloud des Kunden' },
];

export interface PaketVorlage {
  key: string;
  name: string;
  bausteine: Baustein[];
  retainer: number;
  setup: number;
  laufzeit: number;
}

/** Vorbelegung im After-Close – Bausteine lassen sich pro Kunde trotzdem frei anpassen. */
export const PAKET_VORLAGEN: PaketVorlage[] = [
  { key: 'indeed_start', name: 'Vertriebs KI Agent', bausteine: ['indeed'], retainer: 500, setup: 0, laufzeit: 12 },
  { key: 'starter', name: 'Starter', bausteine: ['indeed', 'meta'], retainer: 2380, setup: 0, laufzeit: 6 },
  { key: 'growth', name: 'Growth', bausteine: ['indeed', 'meta'], retainer: 4150, setup: 0, laufzeit: 12 },
  { key: 'scale', name: 'Scale', bausteine: ['indeed', 'meta'], retainer: 5950, setup: 2500, laufzeit: 12 },
  { key: 'custom', name: 'Custom', bausteine: ['indeed', 'meta'], retainer: 0, setup: 0, laufzeit: 12 },
];

const ALLE: Baustein[] = BAUSTEINE.map((b) => b.key);
/** Bestandskunden ohne Angabe: Fulfillment wie bisher (Indeed + Funnel/Meta). */
const STANDARD: Baustein[] = ['indeed', 'meta'];

/** Bausteine aus der DB lesen. */
export function bausteineVon(wert: unknown): Baustein[] {
  if (!Array.isArray(wert)) return STANDARD;
  const gueltig = ALLE.filter((b) => wert.includes(b));
  return gueltig.length ? gueltig : STANDARD;
}

/**
 * Gehört der Kunde in die Innendienst-Übersicht? Bestandskunden ohne Angabe ja (wie bisher),
 * sonst nur mit gebuchtem Baustein Innendienst.
 */
export function mitInnendienst(wert: unknown): boolean {
  return !Array.isArray(wert) || wert.includes('innendienst');
}

/** Eingabe (z. B. aus dem Formular) bereinigen – mindestens ein Baustein, sonst null. */
export function bausteineBereinigen(wert: unknown): Baustein[] | null {
  if (!Array.isArray(wert)) return null;
  const gueltig = ALLE.filter((b) => wert.includes(b));
  return gueltig.length ? gueltig : null;
}

export function paketVorlage(key: string | null | undefined): PaketVorlage | null {
  return PAKET_VORLAGEN.find((p) => p.key === key) ?? null;
}

export function bausteinLabel(b: Baustein): string {
  return BAUSTEINE.find((x) => x.key === b)?.label ?? b;
}
