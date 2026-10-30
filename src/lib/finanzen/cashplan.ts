/**
 * Cash-Plan (Admin → Finanzen → Cash-Plan): alle Kundenverträge mit Monatsgebühr, Setup und Laufzeit
 * → Geldeingang je Monat (netto/brutto) und MRR. Rein, testbar – Daten kommen aus finanz_vertraege.
 *
 * Zwei Sichten:
 *   - „mit Verlängerung“: nach Laufzeitende läuft der Vertrag mit `verlaengerung_monatlich` weiter (falls gesetzt)
 *   - „nur Laufzeit“: endet strikt mit der vereinbarten Laufzeit
 * Unbefristete Verträge (laufzeit_monate = null) laufen in beiden Sichten weiter.
 */

export interface FinanzVertrag {
  id: string;
  kunde: string;
  monatlich: number;
  setup: number;
  /** Monat der Setup-Rechnung (YYYY-MM-01); null = Startmonat */
  setup_monat: string | null;
  /** Erster abgerechneter Monat (YYYY-MM-01) */
  start: string;
  /** null = unbefristet */
  laufzeit_monate: number | null;
  /** Erwartete Monatsgebühr nach Laufzeitende (Verlängerung); null = endet */
  verlaengerung_monatlich: number | null;
  ust_satz: number;
  rechnungstag: number | null;
  status: 'aktiv' | 'startet' | 'beendet';
  notiz: string | null;
}

export interface CashMonat {
  monat: string; // YYYY-MM
  monatlich: number;
  setup: number;
  gesamt: number;
  brutto: number;
  /** Geldeingang, wenn niemand verlängert */
  nurLaufzeit: number;
}

export const monatKey = (d: string | Date): string => {
  if (typeof d === 'string') return d.slice(0, 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function monateAb(start: string, anzahl: number): string[] {
  const [y, m] = start.slice(0, 7).split('-').map(Number);
  return Array.from({ length: anzahl }, (_, i) => {
    const mm = m - 1 + i;
    return `${y + Math.floor(mm / 12)}-${String((mm % 12) + 1).padStart(2, '0')}`;
  });
}

/** Abstand in Monaten zwischen zwei YYYY-MM */
function abstand(von: string, bis: string): number {
  const [y1, m1] = von.split('-').map(Number);
  const [y2, m2] = bis.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/** Monatsgebühr eines Vertrags in einem Monat */
export function gebuehrImMonat(v: FinanzVertrag, monat: string, mitVerlaengerung: boolean): number {
  if (v.status === 'beendet') return 0;
  const i = abstand(monatKey(v.start), monat);
  if (i < 0) return 0;
  if (v.laufzeit_monate == null || i < v.laufzeit_monate) return v.monatlich;
  return mitVerlaengerung ? (v.verlaengerung_monatlich ?? 0) : 0;
}

export function setupImMonat(v: FinanzVertrag, monat: string): number {
  if (v.status === 'beendet' || !v.setup) return 0;
  return monatKey(v.setup_monat ?? v.start) === monat ? v.setup : 0;
}

export function berechneCashplan(vertraege: FinanzVertrag[], abMonat: string, anzahl = 14): CashMonat[] {
  return monateAb(abMonat, anzahl).map((monat) => {
    let monatlich = 0;
    let setup = 0;
    let brutto = 0;
    let nurLaufzeit = 0;
    for (const v of vertraege) {
      const g = gebuehrImMonat(v, monat, true);
      const s = setupImMonat(v, monat);
      monatlich += g;
      setup += s;
      brutto += (g + s) * (1 + (v.ust_satz ?? 0) / 100);
      nurLaufzeit += gebuehrImMonat(v, monat, false) + s;
    }
    const r = (x: number) => Math.round(x * 100) / 100;
    return { monat, monatlich: r(monatlich), setup: r(setup), gesamt: r(monatlich + setup), brutto: r(brutto), nurLaufzeit: r(nurLaufzeit) };
  });
}

/** Wann endet die Laufzeit (letzter abgerechneter Monat), null = unbefristet */
export function laufzeitEnde(v: FinanzVertrag): string | null {
  if (v.laufzeit_monate == null) return null;
  return monateAb(monatKey(v.start), v.laufzeit_monate).at(-1) ?? null;
}

/** Verträge, deren Laufzeit in den nächsten `monate` Monaten endet (für Verlängerungsgespräche) */
export function endetBald(vertraege: FinanzVertrag[], abMonat: string, monate = 3): FinanzVertrag[] {
  const fenster = new Set(monateAb(abMonat, monate));
  return vertraege.filter((v) => v.status !== 'beendet' && fenster.has(laufzeitEnde(v) ?? ''));
}

export interface Zahlung {
  vertrag: FinanzVertrag;
  gebuehr: number;
  setup: number;
  netto: number;
  brutto: number;
  /** Erster Monat des Vertrags */
  neu: boolean;
  /** Letzter Monat der Laufzeit (danach nur bei Verlängerung) */
  letzter: boolean;
  /** Läuft nur über die angenommene Verlängerung */
  verlaengert: boolean;
}

/** Wer zahlt in einem Monat was – sortiert nach Rechnungstag, dann Betrag */
export function zahlungenImMonat(vertraege: FinanzVertrag[], monat: string): Zahlung[] {
  return vertraege
    .map((v) => {
      const gebuehr = gebuehrImMonat(v, monat, true);
      const setup = setupImMonat(v, monat);
      const i = abstand(monatKey(v.start), monat);
      const netto = gebuehr + setup;
      return {
        vertrag: v,
        gebuehr,
        setup,
        netto,
        brutto: Math.round(netto * (1 + (v.ust_satz ?? 0) / 100) * 100) / 100,
        neu: i === 0,
        letzter: v.laufzeit_monate != null && i === v.laufzeit_monate - 1,
        verlaengert: v.laufzeit_monate != null && i >= v.laufzeit_monate && gebuehr > 0,
      };
    })
    .filter((z) => z.netto > 0)
    .sort((a, b) => (a.vertrag.rechnungstag ?? 99) - (b.vertrag.rechnungstag ?? 99) || b.netto - a.netto);
}
