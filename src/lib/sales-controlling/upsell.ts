/**
 * Upsell-Quote aus Close: Jeder gewonnene Deal nach dem ersten eines Kunden ist ein Upsell (neues Paket).
 * Deals aus der Upsell-Pipeline (Bestandskunden) sind immer Upsells – auch wenn der erste Kauf vor Close lag (z. B. OCEC, Navi 8, Wasmund).
 * Kunde = Lead; doppelte Leads mit gleichem Firmennamen (z. B. „B&C Direct Sales“ / „B&C Direct Sales GmbH“) zählen als einer.
 * „Reife“ Kunden: erster Kauf mindestens 6 Wochen her – faire Quote, weil frische Kunden noch kaum nachkaufen konnten.
 */

import { klassifiziere, type CloseStatus, type Opp } from './compute';

const TAG = 864e5;
export const REIFE_TAGE = 42;

/** Firmenname ohne Rechtsform, Satzzeichen und Groß/Klein (rein, testbar) */
export function kundenSchluessel(name: string | null | undefined, leadId: string): string {
  const n = (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(gmbh|ug|ag|kg|ohg|gbr|e\.?\s?k|co|mbh|haftungsbeschrankt|ltd|inc)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  return n.length >= 3 ? n : leadId;
}

export function berechneUpsell(e: { opps: Opp[]; statuses: CloseStatus[]; zeitraum: { von: string; bis: string }; jetzt: Date }) {
  const statusById = new Map(e.statuses.map((s) => [s.id, s]));
  const gewonnen = e.opps
    .filter((o) => klassifiziere(statusById.get(o.status_id)) === 'won')
    .map((o) => ({ ...o, datum: (o.date_won ?? o.date_created).slice(0, 10) }));

  const kunden = new Map<string, { name: string; deals: typeof gewonnen }>();
  for (const o of gewonnen) {
    const key = kundenSchluessel(o.lead_name, o.lead_id);
    const k = kunden.get(key) ?? { name: o.lead_name ?? o.lead_id, deals: [] };
    k.deals.push(o);
    kunden.set(key, k);
  }

  const reifeGrenze = new Date(e.jetzt.getTime() - REIFE_TAGE * TAG).toISOString().slice(0, 10);
  let upsellVolumen = 0;
  let gesamtVolumen = 0;
  let mitUpsell = 0;
  let reif = 0;
  let reifMitUpsell = 0;
  const zr = { neukauf: { anzahl: 0, volumen: 0 }, upsell: { anzahl: 0, volumen: 0 } };
  const liste: Array<{ kunde: string; deals: number; volumen: number; upsellVolumen: number; ersterKauf: string; letzterKauf: string; hatUpsell: boolean }> = [];

  for (const k of kunden.values()) {
    const deals = [...k.deals].sort((a, b) => a.datum.localeCompare(b.datum) || a.date_created.localeCompare(b.date_created));
    const istUpsell = (d: (typeof deals)[number], i: number) => i > 0 || !!d.upsell;
    const volumen = deals.reduce((s, d) => s + d.value, 0);
    const up = deals.reduce((s, d, i) => s + (istUpsell(d, i) ? d.value : 0), 0);
    const hatUpsell = deals.some((d, i) => istUpsell(d, i));
    // Erster Close-Deal schon ein Upsell → Kunde war vorher da: für die Reife zählt „schon lange Kunde“
    const reifSeit = deals[0].upsell ? '0000-00-00' : deals[0].datum;
    gesamtVolumen += volumen;
    upsellVolumen += up;
    if (hatUpsell) mitUpsell++;
    if (reifSeit < reifeGrenze) {
      reif++;
      if (hatUpsell) reifMitUpsell++;
    }
    deals.forEach((d, i) => {
      if (d.datum < e.zeitraum.von || d.datum >= e.zeitraum.bis) return;
      const t = istUpsell(d, i) ? zr.upsell : zr.neukauf;
      t.anzahl++;
      t.volumen += d.value;
    });
    liste.push({ kunde: k.name, deals: deals.length, volumen, upsellVolumen: up, ersterKauf: deals[0].datum, letzterKauf: deals[deals.length - 1].datum, hatUpsell });
  }

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const zrGesamt = zr.neukauf.volumen + zr.upsell.volumen;
  return {
    kunden: kunden.size,
    kundenMitUpsell: mitUpsell,
    /** Anteil Kunden mit mindestens einem Nachkauf (alle Kunden) */
    quote: pct(mitUpsell, kunden.size),
    /** dasselbe nur für Kunden, deren erster Kauf ≥ 6 Wochen her ist */
    quoteReif: pct(reifMitUpsell, reif),
    kundenReif: reif,
    upsellVolumen,
    gesamtVolumen,
    /** Anteil des Gesamtvolumens aus Nachkäufen */
    volumenAnteil: pct(upsellVolumen, gesamtVolumen),
    dealsProKunde: kunden.size ? Math.round((gewonnen.length / kunden.size) * 10) / 10 : null,
    /** Im gewählten Zeitraum: Neukunden- vs. Upsell-Deals */
    zeitraum: { ...zr, upsellAnteil: pct(zr.upsell.volumen, zrGesamt) },
    nachkaeufer: liste.filter((x) => x.hatUpsell).sort((a, b) => b.upsellVolumen - a.upsellVolumen),
  };
}

export type Upsell = ReturnType<typeof berechneUpsell>;
