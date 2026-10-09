/** Regeln für wiederkehrende Aufgaben – rein, auch im Browser nutzbar */

export type Rhythmus = 'taeglich' | 'woechentlich' | 'monatlich';

export interface SerieRegel {
  rhythmus: Rhythmus;
  /** 1 = Montag … 7 = Sonntag */
  wochentag?: number | null;
  /** 1–31; größer als der Monat → letzter Tag */
  monatstag?: number | null;
  nur_werktags?: boolean;
}

const TAG = 864e5;
const d = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);
const plus = (tag: string, n: number) => iso(new Date(d(tag).getTime() + n * TAG));
/** 1 = Montag … 7 = Sonntag */
export const wochentagVon = (tag: string) => ((d(tag).getUTCDay() + 6) % 7) + 1;
const istWochenende = (tag: string) => wochentagVon(tag) >= 6;

/**
 * Termin eines Monats – unabhängig vom Suchdatum, damit ein Monat nie zwei Termine bekommt:
 * Wochenende → Freitag davor; läge der im Vormonat (z. B. Sonntag, der 1.), dann Montag danach.
 */
function monatsTermin(jahr: number, monat0: number, monatstag: number, nurWerktags: boolean): string {
  const letzter = new Date(Date.UTC(jahr, monat0 + 1, 0)).getUTCDate();
  const roh = iso(new Date(Date.UTC(jahr, monat0, Math.min(monatstag, letzter), 12)));
  if (!nurWerktags || !istWochenende(roh)) return roh;
  let zurueck = roh;
  while (istWochenende(zurueck)) zurueck = plus(zurueck, -1);
  if (zurueck.slice(0, 7) === roh.slice(0, 7)) return zurueck;
  let vor = roh;
  while (istWochenende(vor)) vor = plus(vor, 1);
  return vor;
}

/** Gültige Regel erzwingen (ganze Zahlen im Bereich) – schützt die Schleifen unten */
export function bereinigeRegel(r: SerieRegel): { rhythmus: Rhythmus; wochentag: number; monatstag: number; nur_werktags: boolean } {
  const rhythmus: Rhythmus = r.rhythmus === 'taeglich' || r.rhythmus === 'monatlich' ? r.rhythmus : 'woechentlich';
  const wt = Math.trunc(Number(r.wochentag));
  const mt = Math.trunc(Number(r.monatstag));
  return {
    rhythmus,
    wochentag: wt >= 1 && wt <= 7 ? wt : 1,
    monatstag: mt >= 1 && mt <= 31 ? mt : 1,
    nur_werktags: r.nur_werktags !== false,
  };
}

/** Erster Termin am oder nach `ab` (YYYY-MM-DD) */
export function ersterTermin(regel: SerieRegel, ab: string): string {
  const r = bereinigeRegel(regel);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ab)) throw new Error(`Ungültiges Datum ${ab}`);
  if (r.rhythmus === 'taeglich') {
    let t = ab;
    if (r.nur_werktags) while (istWochenende(t)) t = plus(t, 1);
    return t;
  }
  if (r.rhythmus === 'woechentlich') {
    let t = ab;
    for (let i = 0; i < 7 && wochentagVon(t) !== r.wochentag; i++) t = plus(t, 1);
    return t;
  }
  const a = d(ab);
  for (let i = 0; i < 3; i++) {
    const t = monatsTermin(a.getUTCFullYear(), a.getUTCMonth() + i, r.monatstag, r.nur_werktags);
    if (t >= ab) return t;
  }
  return monatsTermin(a.getUTCFullYear(), a.getUTCMonth() + 2, r.monatstag, r.nur_werktags);
}

/** Nächster Termin nach `nach` */
export function naechsterTermin(r: SerieRegel, nach: string): string {
  return ersterTermin(r, plus(nach, 1));
}

export const RHYTHMUS_LABEL: Record<Rhythmus, string> = { taeglich: 'Täglich', woechentlich: 'Wöchentlich', monatlich: 'Monatlich' };
export const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

/** Lesbare Regel, z. B. „Wöchentlich, montags“ */
export function regelText(r: SerieRegel): string {
  if (r.rhythmus === 'taeglich') return r.nur_werktags === false ? 'Täglich' : 'Täglich (Mo–Fr)';
  if (r.rhythmus === 'woechentlich') return `Wöchentlich, ${WOCHENTAGE[(r.wochentag ?? 1) - 1].toLowerCase()}s`;
  return `Monatlich am ${r.monatstag ?? 1}.`;
}

