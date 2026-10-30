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

export interface RechnungsLuecke {
  vertrag: FinanzVertrag;
  monat: string;
  erwartet: number;
  gestellt: number;
  fehlt: number;
}

export interface RechnungsCheck {
  luecken: RechnungsLuecke[];
  fehltGesamt: number;
  /** Verträge ohne Lexware-Kontakt – können nicht geprüft werden */
  nichtZugeordnet: FinanzVertrag[];
}

/**
 * Wurde für jeden Vertrag und Monat die erwartete Rechnung geschrieben?
 * Vergleich je Monat: Plan (Gebühr + Setup, netto) gegen Lexware-Rechnungen des Kontakts mit Rechnungsdatum im Monat.
 * Rechnungen im Vormonat (vorab geschrieben) zählen mit, wenn dort nichts erwartet wurde. 5 % Toleranz.
 */
export function rechnungsCheck(
  vertraege: FinanzVertrag[],
  rechnungen: FinanzRechnung[],
  bisMonat: string,
  gebuehr: (v: FinanzVertrag, monat: string) => number,
  abMonat = '2026-01',
): RechnungsCheck {
  const proKontaktMonat = new Map<string, number>();
  for (const r of rechnungen) {
    if (!r.contact_id || !r.datum || r.status === 'voided') continue;
    const k = `${r.contact_id}|${monatKey(r.datum)}`;
    proKontaktMonat.set(k, (proKontaktMonat.get(k) ?? 0) + nettoVon(r));
  }
  const luecken: RechnungsLuecke[] = [];
  const nichtZugeordnet: FinanzVertrag[] = [];
  // Mehrere Verträge eines Kontakts teilen sich die Rechnungen → Plan je Kontakt summieren
  const planJeKontakt = new Map<string, { vertraege: FinanzVertrag[]; proMonat: Map<string, number> }>();
  for (const v of vertraege) {
    if (v.status === 'streitfall' || v.status === 'beendet') continue;
    const kid = (v as FinanzVertrag & { lex_contact_id?: string | null }).lex_contact_id;
    if (!kid) {
      if (monatKey(v.start) <= bisMonat) nichtZugeordnet.push(v);
      continue;
    }
    const eintrag = planJeKontakt.get(kid) ?? { vertraege: [] as FinanzVertrag[], proMonat: new Map<string, number>() };
    eintrag.vertraege.push(v);
    let m = monatKey(v.start) > abMonat ? monatKey(v.start) : abMonat;
    while (m <= bisMonat) {
      const betrag = gebuehr(v, m);
      if (betrag > 0) eintrag.proMonat.set(m, (eintrag.proMonat.get(m) ?? 0) + betrag);
      const [y, mm] = m.split('-').map(Number);
      m = `${y + Math.floor(mm / 12)}-${String((mm % 12) + 1).padStart(2, '0')}`;
    }
    planJeKontakt.set(kid, eintrag);
  }
  for (const [kid, { vertraege: vs, proMonat }] of planJeKontakt) {
    let vorabUebrig = 0;
    for (const monat of [...proMonat.keys()].sort()) {
      const erwartet = proMonat.get(monat)!;
      const [y, mm] = monat.split('-').map(Number);
      const vormonat = `${mm === 1 ? y - 1 : y}-${String(mm === 1 ? 12 : mm - 1).padStart(2, '0')}`;
      if (!proMonat.has(vormonat)) vorabUebrig += proKontaktMonat.get(`${kid}|${vormonat}`) ?? 0;
      let gestellt = (proKontaktMonat.get(`${kid}|${monat}`) ?? 0) + vorabUebrig;
      vorabUebrig = 0;
      if (gestellt > erwartet) {
        vorabUebrig = 0;
        gestellt = Math.max(gestellt, erwartet);
      }
      const fehlt = Math.round((erwartet - gestellt) * 100) / 100;
      if (fehlt > erwartet * 0.05) luecken.push({ vertrag: vs[0], monat, erwartet, gestellt: Math.round(gestellt * 100) / 100, fehlt });
    }
  }
  luecken.sort((a, b) => a.monat.localeCompare(b.monat) || b.fehlt - a.fehlt);
  return { luecken, fehltGesamt: Math.round(luecken.reduce((s, l) => s + l.fehlt, 0) * 100) / 100, nichtZugeordnet };
}

export interface AnstehendeRechnung {
  vertrag: FinanzVertrag;
  datum: string;
  netto: number;
  geschrieben: boolean;
}

/** Wer bekommt im Monat wann welche Rechnung – und ist sie schon geschrieben? */
export function rechnungsplan(
  vertraege: FinanzVertrag[],
  rechnungen: FinanzRechnung[],
  monat: string,
  betrag: (v: FinanzVertrag, monat: string) => number,
): AnstehendeRechnung[] {
  const gestellt = new Map<string, number>();
  for (const r of rechnungen) {
    if (!r.contact_id || !r.datum || r.status === 'voided' || monatKey(r.datum) !== monat) continue;
    gestellt.set(r.contact_id, (gestellt.get(r.contact_id) ?? 0) + nettoVon(r));
  }
  return vertraege
    .map((v) => ({ v, netto: betrag(v, monat) }))
    .filter(({ netto }) => netto > 0)
    .map(({ v, netto }) => {
      const kid = (v as FinanzVertrag & { lex_contact_id?: string | null }).lex_contact_id;
      const tag = Math.min(v.rechnungstag ?? 1, 28);
      return { vertrag: v, netto, datum: `${monat}-${String(tag).padStart(2, '0')}`, geschrieben: !!kid && (gestellt.get(kid) ?? 0) >= netto * 0.95 };
    })
    .sort((a, b) => a.datum.localeCompare(b.datum) || b.netto - a.netto);
}
