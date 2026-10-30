/**
 * Kennzahlen aus den Lexware-Rechnungen (finanz_rechnungen) und den Verträgen – rein, testbar.
 *   - Ist je Monat (nach Zahlungsdatum)
 *   - Zahlungsmoral: Ø Tage bis Zahlung, Anteil pünktlich, offen, überfällig
 *   - Abschlüsse je Monat, Ø Tage vom Abschluss bis zum ersten Geld
 */

import { monatKey, type FinanzVertrag } from './cashplan';

export interface FinanzRechnung {
  voucher_id: string;
  nummer: string | null;
  contact_id: string | null;
  kontakt: string | null;
  datum: string | null;
  faellig: string | null;
  brutto: number | null;
  netto: number | null;
  offen: number | null;
  status: string | null;
  bezahlt_am: string | null;
}

const bezahlt = (r: FinanzRechnung) => (r.status === 'paid' || r.status === 'paidoff') && !!r.bezahlt_am;
const istOffen = (r: FinanzRechnung) => r.status === 'open' || r.status === 'overdue';
/** Netto, sonst aus brutto geschätzt (19 %) */
export const nettoVon = (r: FinanzRechnung) => r.netto ?? (r.brutto ?? 0) / 1.19;
const tage = (von: string, bis: string) => Math.round((Date.parse(`${bis.slice(0, 10)}T12:00:00Z`) - Date.parse(`${von.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Tatsächlich eingegangen je Monat (nach Zahlungsdatum) */
export function istProMonat(rechnungen: FinanzRechnung[]): Map<string, { netto: number; brutto: number; anzahl: number }> {
  const m = new Map<string, { netto: number; brutto: number; anzahl: number }>();
  for (const r of rechnungen) {
    if (!bezahlt(r)) continue;
    const k = monatKey(r.bezahlt_am!);
    const cur = m.get(k) ?? { netto: 0, brutto: 0, anzahl: 0 };
    cur.netto = r2(cur.netto + nettoVon(r));
    cur.brutto = r2(cur.brutto + (r.brutto ?? 0));
    cur.anzahl++;
    m.set(k, cur);
  }
  return m;
}

export interface Zahlungsmoral {
  bezahlteRechnungen: number;
  /** Ø Tage Rechnungsdatum → Zahlung */
  tageBisZahlung: number | null;
  /** Anteil bis zur Fälligkeit bezahlt (0–1) */
  puenktlich: number | null;
  offenBrutto: number;
  offenAnzahl: number;
  ueberfaelligBrutto: number;
  ueberfaellig: FinanzRechnung[];
}

export function zahlungsmoral(rechnungen: FinanzRechnung[], heute: string, seit?: string): Zahlungsmoral {
  const imZeitraum = (r: FinanzRechnung) => !seit || (r.datum ?? '') >= seit;
  const paid = rechnungen.filter((r) => bezahlt(r) && r.datum && imZeitraum(r));
  const dauer = paid.map((r) => Math.max(0, tage(r.datum!, r.bezahlt_am!)));
  const mitFrist = paid.filter((r) => r.faellig);
  const offen = rechnungen.filter(istOffen);
  const ueberfaellig = offen.filter((r) => r.faellig && r.faellig < heute).sort((a, b) => (a.faellig ?? '').localeCompare(b.faellig ?? ''));
  const summe = (l: FinanzRechnung[]) => r2(l.reduce((s, r) => s + (r.offen ?? r.brutto ?? 0), 0));
  return {
    bezahlteRechnungen: paid.length,
    tageBisZahlung: dauer.length ? Math.round((dauer.reduce((s, d) => s + d, 0) / dauer.length) * 10) / 10 : null,
    puenktlich: mitFrist.length ? mitFrist.filter((r) => r.bezahlt_am! <= r.faellig!).length / mitFrist.length : null,
    offenBrutto: summe(offen),
    offenAnzahl: offen.length,
    ueberfaelligBrutto: summe(ueberfaellig),
    ueberfaellig,
  };
}

export interface AbschlussQuoten {
  /** Abschlüsse je Monat (abschluss_am), älteste zuerst */
  proMonat: Array<{ monat: string; abschluesse: number; streitfaelle: number }>;
  /** Ø Tage vom Abschluss bis zur ersten Zahlung (nur zugeordnete Verträge) */
  tageBisErstesGeld: number | null;
  mitErstemGeld: number;
  ohneZahlung: FinanzVertrag[];
}

export function abschlussQuoten(vertraege: FinanzVertrag[], rechnungen: FinanzRechnung[]): AbschlussQuoten {
  const proMonat = new Map<string, { abschluesse: number; streitfaelle: number }>();
  for (const v of vertraege) {
    if (!v.abschluss_am) continue;
    const k = monatKey(v.abschluss_am);
    const cur = proMonat.get(k) ?? { abschluesse: 0, streitfaelle: 0 };
    cur.abschluesse++;
    if (v.status === 'streitfall') cur.streitfaelle++;
    proMonat.set(k, cur);
  }
  const ersteZahlung = new Map<string, string[]>();
  for (const r of rechnungen) {
    if (!bezahlt(r) || !r.contact_id) continue;
    ersteZahlung.set(r.contact_id, [...(ersteZahlung.get(r.contact_id) ?? []), r.bezahlt_am!]);
  }
  const dauer: number[] = [];
  const ohneZahlung: FinanzVertrag[] = [];
  for (const v of vertraege) {
    const kid = (v as FinanzVertrag & { lex_contact_id?: string | null }).lex_contact_id;
    if (!v.abschluss_am || !kid || v.status === 'streitfall') continue;
    const erste = (ersteZahlung.get(kid) ?? []).filter((d) => d >= v.abschluss_am!.slice(0, 10)).sort()[0];
    if (erste) dauer.push(tage(v.abschluss_am, erste));
    else ohneZahlung.push(v);
  }
  return {
    proMonat: [...proMonat.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([monat, x]) => ({ monat, ...x })),
    tageBisErstesGeld: dauer.length ? Math.round((dauer.reduce((s, d) => s + d, 0) / dauer.length) * 10) / 10 : null,
    mitErstemGeld: dauer.length,
    ohneZahlung,
  };
}
