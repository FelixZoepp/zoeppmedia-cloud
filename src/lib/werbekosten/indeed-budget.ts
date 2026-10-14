/**
 * Indeed-Kosten aus dem Tagesbudget: je Phase Tagesbudget × Tage im Zeitraum (Start und Ende jeweils inklusive).
 * Indeed gibt das Tagesbudget in der Regel voll aus – exakte Kosten gäbe es nur über den Export.
 * Rein, testbar. Datumsangaben als YYYY-MM-DD (Berlin).
 */

export interface BudgetPhase {
  id?: string;
  tagesbudget: number;
  start: string;
  ende: string | null;
}

const TAG = 864e5;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Tage (inklusive) einer Phase im Zeitraum [von, bis] */
export function tageImZeitraum(p: Pick<BudgetPhase, 'start' | 'ende'>, von: string, bis: string): number {
  const a = Math.max(t(p.start), t(von));
  const b = Math.min(t(p.ende ?? bis), t(bis));
  return b < a ? 0 : Math.round((b - a) / TAG) + 1;
}

export function indeedKosten(phasen: BudgetPhase[], von: string, bis: string): { kosten: number; tage: number } {
  let kosten = 0;
  let tage = 0;
  for (const p of phasen) {
    const n = tageImZeitraum(p, von, bis);
    kosten += n * Number(p.tagesbudget);
    tage += n;
  }
  return { kosten: Math.round(kosten * 100) / 100, tage };
}

/** Leadpreis = Kosten ÷ Bewerber; null ohne Bewerber oder ohne Kosten */
export function leadpreis(kosten: number, bewerber: number): number | null {
  return bewerber > 0 && kosten > 0 ? Math.round((kosten / bewerber) * 100) / 100 : null;
}

/** Läuft gerade eine Phase? */
export function laufendePhase(phasen: BudgetPhase[], heute: string): BudgetPhase | null {
  return phasen.find((p) => p.start <= heute && (!p.ende || p.ende >= heute)) ?? null;
}

/** Erster Starttag aller Phasen (für „seit Start“) */
export function ersterStart(phasen: BudgetPhase[]): string | null {
  return phasen.map((p) => p.start).sort()[0] ?? null;
}
