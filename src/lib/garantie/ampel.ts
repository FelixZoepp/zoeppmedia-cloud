/** Garantie-Ampel: Fortschritt beim Ziel (eingestellte Starter) gegen den verstrichenen Garantiezeitraum. */

export type GarantieAmpel = 'offen' | 'anlauf' | 'gruen' | 'gelb' | 'rot' | 'erreicht';

export const AMPEL_LABEL: Record<GarantieAmpel, string> = {
  offen: 'Noch nicht gestartet',
  anlauf: 'Anlaufphase',
  gruen: 'Im Plan',
  gelb: 'Etwas hinter Plan',
  rot: 'Deutlich hinter Plan',
  erreicht: 'Ziel erreicht',
};

/** In den ersten Tagen nach Kampagnenstart wird noch nicht bewertet */
export const ANLAUF_TAGE = 14;
/** Anteil am Soll-Fortschritt, ab dem die Ampel grün bzw. gelb ist */
const GRUEN_AB = 0.9;
const GELB_AB = 0.6;

const TAG_MS = 24 * 60 * 60 * 1000;

export interface AmpelErgebnis {
  ampel: GarantieAmpel;
  /** verstrichener Anteil des Garantiezeitraums (0–1) */
  zeitAnteil: number;
  /** erreichter Anteil am Ziel (0–1, kann > 1 sein) */
  zielAnteil: number;
  /** nach Zeitfortschritt erwartete Starter bis heute */
  soll: number;
}

export function berechneAmpel(p: { start: Date | null; ende: Date | null; ziel: number | null; ist: number; now: Date }): AmpelErgebnis {
  const ziel = p.ziel ?? 0;
  if (!p.start || !p.ende || ziel <= 0 || p.ende.getTime() <= p.start.getTime()) {
    return { ampel: 'offen', zeitAnteil: 0, zielAnteil: 0, soll: 0 };
  }
  const gesamt = p.ende.getTime() - p.start.getTime();
  const vergangen = p.now.getTime() - p.start.getTime();
  const zeitAnteil = Math.min(1, Math.max(0, vergangen / gesamt));
  const zielAnteil = p.ist / ziel;
  const soll = Math.round(zeitAnteil * ziel * 10) / 10;

  if (vergangen < 0) return { ampel: 'offen', zeitAnteil, zielAnteil, soll };
  if (p.ist >= ziel) return { ampel: 'erreicht', zeitAnteil, zielAnteil, soll };
  // Zeitraum abgelaufen, Ziel verfehlt
  if (zeitAnteil >= 1) return { ampel: 'rot', zeitAnteil, zielAnteil, soll };
  if (vergangen < ANLAUF_TAGE * TAG_MS) return { ampel: 'anlauf', zeitAnteil, zielAnteil, soll };

  const quote = zielAnteil / zeitAnteil;
  const ampel: GarantieAmpel = quote >= GRUEN_AB ? 'gruen' : quote >= GELB_AB ? 'gelb' : 'rot';
  return { ampel, zeitAnteil, zielAnteil, soll };
}

/** Kalendermonate addieren (31.01. + 1 Monat → 28./29.02.) */
export function plusMonate(d: Date, monate: number): Date {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monate, 1));
  const letzter = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(d.getUTCDate(), letzter));
  return r;
}

/**
 * Garantiezeitraum: beginnt mit dem Kampagnenstart (launch_datum), nicht mit dem Vertrag.
 * Länge = Vertragslaufzeit (laufzeit_monate), ersatzweise die Spanne garantie_start → garantie_ende, sonst 12 Monate.
 */
export function garantieZeitraum(a: {
  launch_datum: string | null;
  laufzeit_monate: number | null;
  garantie_start: string | null;
  garantie_ende: string | null;
}): { start: Date | null; ende: Date | null } {
  if (!a.launch_datum) return { start: null, ende: null };
  const start = new Date(`${a.launch_datum.slice(0, 10)}T00:00:00Z`);
  if (a.laufzeit_monate && a.laufzeit_monate > 0) return { start, ende: plusMonate(start, a.laufzeit_monate) };
  if (a.garantie_start && a.garantie_ende) {
    const spanne = new Date(a.garantie_ende).getTime() - new Date(a.garantie_start).getTime();
    if (spanne > 0) return { start, ende: new Date(start.getTime() + spanne) };
  }
  return { start, ende: plusMonate(start, 12) };
}

/** Alarm nur beim Wechsel in eine schlechtere Stufe – nicht täglich und nicht beim allerersten Berechnen */
export function alarmBeiWechsel(vorher: GarantieAmpel | null, jetzt: GarantieAmpel): 'aufgabe' | 'hinweis' | null {
  if (vorher === null || vorher === jetzt) return null;
  if (jetzt === 'rot') return 'aufgabe';
  if (jetzt === 'gelb' && vorher !== 'rot') return 'hinweis';
  return null;
}

/** Fristen vor Laufzeitende, an denen ein Verlängerungsgespräch fällig wird */
export const VERLAENGERUNG_FRISTEN = [30, 14] as const;

/**
 * Welche Fristen jetzt neu fällig sind.
 * `erinnert === null` heißt: noch nie geprüft → schon verstrichene Fristen werden nur vermerkt (kein Nachholen).
 */
export function faelligeFristen(
  tageBisEnde: number,
  erinnert: number[] | null,
): { neu: number[]; vermerken: number[] } {
  const verstrichen = VERLAENGERUNG_FRISTEN.filter((f) => tageBisEnde <= f);
  if (erinnert === null) return { neu: [], vermerken: [...verstrichen] };
  const offen = verstrichen.filter((f) => !erinnert.includes(f));
  // Vertrag schon vorbei: nichts mehr anstoßen, nur vermerken
  if (tageBisEnde < 0) return { neu: [], vermerken: offen };
  // Bei mehreren gleichzeitig fälligen Fristen nur die engste als Aufgabe
  if (offen.length === 0) return { neu: [], vermerken: [] };
  const engste = Math.min(...offen);
  return { neu: [engste], vermerken: offen };
}
