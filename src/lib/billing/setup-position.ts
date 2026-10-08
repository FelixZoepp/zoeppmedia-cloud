/**
 * Erste Rechnung nach dem Abschluss: Einrichtungsgebühr – oder ohne Einrichtungsgebühr der erste Monat.
 * Reine Funktion, damit Formular-Vorschau und Server dieselbe Position rechnen.
 */

export const UST_SATZ = 19;
/** Zahlungsziel der ersten Rechnung in Tagen */
export const ZAHLUNGSZIEL_TAGE = 7;

export interface ErsteRechnungPosition {
  typ: 'setup' | 'retainer';
  /** Abrechnungsmonat YYYY-MM (Schlüssel für billing_runs, passt zum Abrechnungslauf) */
  periode: string;
  bezeichnung: string;
  betrag_netto: number;
  ust_betrag: number;
  betrag_brutto: number;
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const rund = (n: number) => Math.round(n * 100) / 100;

export function ersteRechnungPosition(params: {
  setup_betrag?: number | null;
  mrr?: number | null;
  paket_name: string;
  start_datum: string; // YYYY-MM-DD
}): ErsteRechnungPosition | null {
  const setup = Number(params.setup_betrag) || 0;
  const mrr = Number(params.mrr) || 0;
  const periode = params.start_datum.slice(0, 7);

  let typ: ErsteRechnungPosition['typ'];
  let netto: number;
  let bezeichnung: string;
  if (setup > 0) {
    typ = 'setup';
    netto = setup;
    bezeichnung = `Einrichtungsgebühr – Paket ${params.paket_name}`;
  } else if (mrr > 0) {
    typ = 'retainer';
    netto = mrr;
    const [j, m] = periode.split('-').map(Number);
    bezeichnung = `Retainer ${MONATE[m - 1] ?? periode} ${j} – Paket ${params.paket_name}`;
  } else {
    return null;
  }

  const ust = rund(netto * (UST_SATZ / 100));
  return { typ, periode, bezeichnung, betrag_netto: rund(netto), ust_betrag: ust, betrag_brutto: rund(netto + ust) };
}

/** "Musterstr. 1, 12345 Berlin" → Lexware-Adresse; unbekanntes Format → nur die Straße */
export function parseAnschrift(text: string | null | undefined): { street?: string; zip?: string; city?: string } {
  const t = (text ?? '').trim();
  if (!t) return {};
  const m = t.match(/^(.*?)[,\s]+(\d{5})\s+(.+)$/);
  if (m) return { street: m[1].replace(/,\s*$/, '').trim() || undefined, zip: m[2], city: m[3].trim() };
  return { street: t };
}
