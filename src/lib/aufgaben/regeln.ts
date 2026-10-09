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

function monatsTermin(jahr: number, monat0: number, monatstag: number, nurWerktags: boolean, ab: string): string {
  const letzter = new Date(Date.UTC(jahr, monat0 + 1, 0)).getUTCDate();
  const roh = iso(new Date(Date.UTC(jahr, monat0, Math.min(monatstag, letzter), 12)));
  if (!nurWerktags || !istWochenende(roh)) return roh;
  // Wochenende: auf den Freitag davor ziehen – liegt der schon vor „ab“, auf den Montag danach
  let zurueck = roh;
  while (istWochenende(zurueck)) zurueck = plus(zurueck, -1);
  if (zurueck >= ab || roh < ab) return zurueck;
  let vor = roh;
  while (istWochenende(vor)) vor = plus(vor, 1);
  return vor;
}

/** Erster Termin am oder nach `ab` (YYYY-MM-DD) */
export function ersterTermin(r: SerieRegel, ab: string): string {
  const werktags = r.nur_werktags ?? true;
  if (r.rhythmus === 'taeglich') {
    let t = ab;
    if (werktags) while (istWochenende(t)) t = plus(t, 1);
    return t;
  }
  if (r.rhythmus === 'woechentlich') {
    const ziel = r.wochentag ?? 1;
    let t = ab;
    while (wochentagVon(t) !== ziel) t = plus(t, 1);
    return t;
  }
  const md = r.monatstag ?? 1;
  const a = d(ab);
  for (let i = 0; i < 3; i++) {
    const t = monatsTermin(a.getUTCFullYear(), a.getUTCMonth() + i, md, werktags, ab);
    if (t >= ab) return t;
  }
  return monatsTermin(a.getUTCFullYear(), a.getUTCMonth() + 1, md, werktags, ab);
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

