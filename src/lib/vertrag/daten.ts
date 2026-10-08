/**
 * Eckdaten des Vertrags, so wie der Kunde sie in der Cloud bestätigt.
 * Reine Funktionen – auch auf der öffentlichen Seite nutzbar.
 */

export interface VertragDaten {
  firma: string;
  anschrift: string | null;
  ansprechpartner: string;
  email: string;
  paket: string;
  leistungen: string[];
  setup_netto: number;
  monat_netto: number;
  laufzeit_monate: number;
  start_datum: string; // YYYY-MM-DD
  garantie_ziel_starter: number | null;
  ust_satz: number;
}

/** Feste Reihenfolge der Schlüssel → gleicher Hash für gleiche Daten */
export function kanonisch(daten: VertragDaten, agbUrl: string | null): string {
  const sortiert = Object.fromEntries(Object.entries(daten).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ daten: sortiert, agb_url: agbUrl ?? '' });
}

export const euro = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export function datumDe(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}

/** Zeilen für Bestätigungsseite und PDF */
export function vertragZeilen(d: VertragDaten): Array<[string, string]> {
  const zeilen: Array<[string, string]> = [
    ['Auftraggeber', d.anschrift ? `${d.firma}, ${d.anschrift}` : d.firma],
    ['Ansprechpartner', d.ansprechpartner],
    ['Paket', d.paket],
  ];
  if (d.leistungen.length) zeilen.push(['Leistungen', d.leistungen.join(', ')]);
  zeilen.push(['Einrichtungsgebühr', d.setup_netto > 0 ? `${euro(d.setup_netto)} netto (einmalig)` : 'keine']);
  zeilen.push(['Monatlicher Preis', `${euro(d.monat_netto)} netto`]);
  zeilen.push(['Laufzeit', `${d.laufzeit_monate} Monate`]);
  zeilen.push(['Start', datumDe(d.start_datum)]);
  if (d.garantie_ziel_starter) zeilen.push(['Garantieziel', `${d.garantie_ziel_starter} Starter`]);
  zeilen.push(['Umsatzsteuer', `zzgl. ${d.ust_satz} % USt.`]);
  return zeilen;
}
