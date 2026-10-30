/**
 * Ziel-Tracker im Cash-Plan (Masterplan): Ist-Kennzahlen eines Monats gegen Felix' Ziele.
 * Rein, testbar. Ziele liegen in system_einstellungen.finanz_ziele (JSON), Standardwerte unten.
 */

import { monatKey, monateAb } from './cashplan';
import type { FinanzRechnung } from './zahlungen';

export const ZIELE_KEY = 'finanz_ziele';

export interface Ziele {
  umsatzMonat: number;
  neukundenMonat: number;
  /** Anteil der Kunden, die später mehr zahlen als am Anfang (0–1) */
  upsellQuote: number;
  /** Höchstens so viele zahlende Kunden gehen pro Monat verloren (0–1) */
  churnMax: number;
  kundenProKopf: number;
  /** Mindest-Marge (Überschuss / Einnahmen) */
  margeMin: number;
  /** Werbung höchstens dieser Anteil der Monatsgebühren */
  werbeanteilMax: number;
  /** Personen im Fulfillment */
  fulfillmentKoepfe: number;
}

export const STANDARD_ZIELE: Ziele = {
  umsatzMonat: 300_000,
  neukundenMonat: 15,
  upsellQuote: 0.65,
  churnMax: 0.1,
  kundenProKopf: 90,
  margeMin: 0.6,
  werbeanteilMax: 0.25,
  fulfillmentKoepfe: 1,
};

export function liesZiele(wert: unknown): Ziele {
  let w = wert;
  if (typeof w === 'string') {
    try {
      w = JSON.parse(w);
    } catch {
      w = null;
    }
  }
  const o = (w && typeof w === 'object' ? w : {}) as Partial<Record<keyof Ziele, unknown>>;
  const z = { ...STANDARD_ZIELE };
  for (const k of Object.keys(STANDARD_ZIELE) as Array<keyof Ziele>) {
    const n = Number(o[k]);
    if (o[k] != null && Number.isFinite(n) && n >= 0) z[k] = n;
  }
  return z;
}

const vormonat = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`;
};

export interface KundenKennzahlen {
  /** Kunden mit Rechnung im Monat */
  zahlend: number;
  /** davon erstmals */
  neu: number;
  /** In den 2 Monaten davor zahlend, in diesem und dem Vormonat nicht mehr */
  verloren: number;
  /** verloren / zahlend vor 2 Monaten */
  churn: number | null;
  /** Kunden mit 2+ Monaten Rechnungen, deren höchster Monat > 1,3 × erster Monat (bis zum Monat) */
  upsellQuote: number | null;
  /** Ø Umsatz netto je Kunde mit 3+ Rechnungsmonaten (bis zum Monat) */
  ltvWiederkehrend: number | null;
}

/** Kunden-Kennzahlen aus den Lexware-Rechnungen (je Kontakt und Monat) */
export function kundenKennzahlen(rechnungen: FinanzRechnung[], monat: string): KundenKennzahlen {
  const proKontakt = new Map<string, Map<string, number>>();
  for (const r of rechnungen) {
    if (!r.contact_id || !r.datum || r.status === 'voided') continue;
    const m = monatKey(r.datum);
    if (m > monat) continue;
    const k = proKontakt.get(r.contact_id) ?? new Map<string, number>();
    k.set(m, (k.get(m) ?? 0) + (r.netto ?? (r.brutto ?? 0) / 1.19));
    proKontakt.set(r.contact_id, k);
  }
  const v1 = vormonat(monat);
  const v2 = vormonat(v1);
  const v3 = vormonat(v2);
  let zahlend = 0;
  let neu = 0;
  let basis = 0;
  let verloren = 0;
  let mehrmonatig = 0;
  let upsell = 0;
  const ltv: number[] = [];
  for (const monate of proKontakt.values()) {
    const keys = [...monate.keys()].sort();
    if (monate.has(monat)) {
      zahlend++;
      if (keys[0] === monat) neu++;
    }
    if (monate.has(v2) || monate.has(v3)) {
      basis++;
      if (!monate.has(v1) && !monate.has(monat)) verloren++;
    }
    if (keys.length >= 2) {
      mehrmonatig++;
      const erster = monate.get(keys[0])!;
      const max = Math.max(...monate.values());
      if (max > erster * 1.3) upsell++;
    }
    if (keys.length >= 3) ltv.push([...monate.values()].reduce((s, x) => s + x, 0));
  }
  return {
    zahlend,
    neu,
    verloren,
    churn: basis ? verloren / basis : null,
    upsellQuote: mehrmonatig ? upsell / mehrmonatig : null,
    ltvWiederkehrend: ltv.length ? Math.round(ltv.reduce((s, x) => s + x, 0) / ltv.length) : null,
  };
}

export interface ZielZeile {
  key: string;
  label: string;
  ist: number | null;
  ziel: number;
  /** true = höher ist besser */
  hoeherBesser: boolean;
  format: 'euro' | 'zahl' | 'prozent';
  erreicht: boolean | null;
}

export function zielZeilen(args: {
  ziele: Ziele;
  einnahmen: number;
  monatsgebuehren: number;
  ueberschuss: number;
  werbung: number;
  aktiveVertraege: number;
  kunden: KundenKennzahlen;
}): ZielZeile[] {
  const { ziele: z } = args;
  const zeile = (key: string, label: string, ist: number | null, ziel: number, hoeherBesser: boolean, format: ZielZeile['format']): ZielZeile => ({
    key,
    label,
    ist,
    ziel,
    hoeherBesser,
    format,
    erreicht: ist == null ? null : hoeherBesser ? ist >= ziel : ist <= ziel,
  });
  return [
    zeile('umsatz', 'Einnahmen im Monat (netto)', args.einnahmen, z.umsatzMonat, true, 'euro'),
    zeile('neukunden', 'Neue zahlende Kunden', args.kunden.neu, z.neukundenMonat, true, 'zahl'),
    zeile('upsell', 'Upsell-Quote (zahlen später mehr)', args.kunden.upsellQuote, z.upsellQuote, true, 'prozent'),
    zeile('churn', 'Churn (verlorene Kunden je Monat)', args.kunden.churn, z.churnMax, false, 'prozent'),
    zeile('kopf', 'Kunden pro Fulfillment-Person', z.fulfillmentKoepfe ? args.aktiveVertraege / z.fulfillmentKoepfe : null, z.kundenProKopf, true, 'zahl'),
    zeile('marge', 'Marge (Überschuss / Einnahmen)', args.einnahmen ? args.ueberschuss / args.einnahmen : null, z.margeMin, true, 'prozent'),
    zeile('werbung', 'Werbung im Verhältnis zur MRR', args.monatsgebuehren ? args.werbung / args.monatsgebuehren : null, z.werbeanteilMax, false, 'prozent'),
  ];
}

/** Wie viele Neukunden pro Monat für das Umsatzziel? (eingeschwungen: Umsatz ≈ Neukunden × LTV) */
export function neukundenFuerZiel(umsatzZiel: number, ltv: number | null): number | null {
  if (!ltv || ltv <= 0) return null;
  return Math.ceil(umsatzZiel / ltv);
}

export { monateAb };
