/**
 * Umsatz-Analyse: woher der Umsatz kommt, wie er entsteht, Neu- vs. Bestandskunden.
 * Reine Berechnung – Daten liefert ./laden.ts (Lexware-Rechnungen, Kunden, Close).
 */

import { passtZu } from '@/lib/billing/rechnungsliste';

export type Rechnungsstatus = 'open' | 'paid' | 'paidoff';
export type Umsatzart = 'setup' | 'retainer' | 'upsell' | 'sonstiges';
export type Kundenart = 'neukunde' | 'bestand' | 'upsell';

export interface Rechnung {
  id: string;
  nummer: string | null;
  datum: string; // YYYY-MM-DD
  status: Rechnungsstatus;
  brutto: number;
  /** Netto aus den Rechnungsdetails; null → Schätzung brutto / 1,19 */
  netto: number | null;
  contactId: string | null;
  contactName: string;
  /** Positionstexte aus den Rechnungsdetails (falls geladen) */
  positionen: string[];
}

export interface Kunde {
  id: string;
  name: string;
  lex_contact_id: string | null;
  vertragsstart: string | null;
  mrr: number | null;
  setup_betrag: number | null;
  paket: string | null;
  fulfillment_phase: string | null;
  laufzeit_monate: number | null;
}

export interface Fakturiert {
  rechnungsnummer: string | null;
  typ: string;
  agency_id: string;
}

export interface Abschluss {
  lead_id: string;
  lead_name: string | null;
  wert: number;
  datum: string; // date_won
  quelle: string | null;
}

export interface Zeitraum {
  von: string; // inklusiv, YYYY-MM-DD
  bis: string; // exklusiv
}

export interface UmsatzEingaben {
  rechnungen: Rechnung[];
  kunden: Kunde[];
  fakturiert: Fakturiert[];
  abschluesse: Abschluss[];
  zeitraum: Zeitraum;
  vorperiode: Zeitraum;
  heute: string;
  closeVerbunden: boolean;
}

const TAG = 86_400_000;
const NEUKUNDE_TAGE = 30;
const INAKTIV = ['offboarding', 'beendet'];
const r2 = (n: number) => Math.round(n * 100) / 100;
const plusTage = (d: string, t: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + t * TAG).toISOString().slice(0, 10);
const tageZwischen = (a: string, b: string) => (new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / TAG;
const drin = (d: string, z: Zeitraum) => d >= z.von && d < z.bis;
const nahe = (a: number, b: number | null) => b != null && b > 0 && Math.abs(a - b) <= Math.max(1, b * 0.03);

export const netto = (r: Rechnung) => (r.netto != null ? r.netto : r2(r.brutto / 1.19));

/** Leadquelle → Kategorie (gleiche Einteilung wie im Sales-Controlling) */
export function quellenKategorie(q: string | null | undefined): string {
  const s = (q ?? '').toLowerCase();
  if (!s) return 'Unbekannt';
  if (/(meta|facebook|instagram|fb|ig|paid)/.test(s)) return 'Meta Ads';
  if (/(empfehl|referral)/.test(s)) return 'Empfehlung';
  if (/(google|seo|organic|organisch|website)/.test(s)) return 'Organisch/Website';
  if (/(linkedin)/.test(s)) return 'LinkedIn';
  if (/(kalt|outbound|cold)/.test(s)) return 'Outbound';
  return 'Sonstige';
}

/** Art einer Rechnung: Rechnungsliste der Cloud → Positionstexte → Betrag passt zu Setup/Monat → Sonstiges */
export function umsatzart(r: Rechnung, kunde: Kunde | null, fakturiertTyp: string | null): Umsatzart {
  if (fakturiertTyp === 'setup') return 'setup';
  if (fakturiertTyp === 'retainer') return 'retainer';
  const text = r.positionen.join(' ').toLowerCase();
  if (text) {
    if (/(upsell|zusatz|zusätzlich|extra|erweiterung|weitere region|aufstockung)/.test(text)) return 'upsell';
    if (/(setup|einricht|onboarding|aufbau|einmalig)/.test(text)) return 'setup';
    if (/(retainer|monat|monatlich|pauschale|betreuung|laufend|abo)/.test(text)) return 'retainer';
  }
  const n = netto(r);
  if (kunde && nahe(n, kunde.setup_betrag)) return 'setup';
  if (kunde && nahe(n, kunde.mrr)) return 'retainer';
  return 'sonstiges';
}

/** Kunde zu einer Rechnung: Lexware-Kontakt, sonst Namensabgleich */
export function kundeZuRechnung(r: Rechnung, kunden: Kunde[]): Kunde | null {
  if (r.contactId) {
    const k = kunden.find((x) => x.lex_contact_id === r.contactId);
    if (k) return k;
  }
  return kunden.find((x) => passtZu(x.name, r.contactName)) ?? null;
}

/** Ursprünglicher Close-Abschluss eines Kunden (ältester gewonnener Deal mit passendem Namen) */
export function abschlussZuKunde(name: string, abschluesse: Abschluss[]): Abschluss | null {
  const passend = abschluesse.filter((a) => a.lead_name && passtZu(name, a.lead_name));
  return passend.sort((a, b) => a.datum.localeCompare(b.datum))[0] ?? null;
}

interface Zeile {
  r: Rechnung;
  netto: number;
  kundeKey: string;
  kundeName: string;
  kunde: Kunde | null;
  art: Umsatzart;
  kundenart: Kundenart;
  quelle: string;
}

/** Jede Rechnung klassifizieren (über den gesamten Bestand, damit „erste Rechnung“ stimmt) */
export function klassifiziere(e: Pick<UmsatzEingaben, 'rechnungen' | 'kunden' | 'fakturiert' | 'abschluesse'>): Zeile[] {
  const nachNummer = new Map(e.fakturiert.filter((f) => f.rechnungsnummer).map((f) => [f.rechnungsnummer!.trim(), f.typ]));
  const basis = e.rechnungen.map((r) => {
    const kunde = kundeZuRechnung(r, e.kunden);
    return { r, kunde, kundeKey: kunde?.id ?? `lex:${r.contactId ?? r.contactName}`, kundeName: kunde?.name ?? r.contactName };
  });

  // Start je Kunde: früheste Rechnung bzw. Vertragsstart
  const start = new Map<string, string>();
  for (const b of basis) {
    const kandidaten = [b.r.datum, b.kunde?.vertragsstart ?? null].filter((x): x is string => !!x);
    const fr = kandidaten.sort()[0];
    const cur = start.get(b.kundeKey);
    if (!cur || fr < cur) start.set(b.kundeKey, fr);
  }

  // Monatsbetrag vor der Rechnung (für „höherer Monatsbetrag“ = Upsell)
  const sortiert = [...basis].sort((a, b) => a.r.datum.localeCompare(b.r.datum));
  const letzterMonat = new Map<string, number>();
  const zeilen: Zeile[] = [];
  for (const b of sortiert) {
    const n = netto(b.r);
    const art = umsatzart(b.r, b.kunde, b.r.nummer ? nachNummer.get(b.r.nummer.trim()) ?? null : null);
    const s = start.get(b.kundeKey)!;
    let kundenart: Kundenart = tageZwischen(s, b.r.datum) <= NEUKUNDE_TAGE ? 'neukunde' : 'bestand';
    if (kundenart === 'bestand') {
      const vorher = letzterMonat.get(b.kundeKey);
      const neuerDeal = e.abschluesse.some(
        (a) => a.lead_name && passtZu(b.kundeName, a.lead_name) && tageZwischen(s, a.datum.slice(0, 10)) > NEUKUNDE_TAGE && tageZwischen(a.datum.slice(0, 10), b.r.datum) >= 0 && tageZwischen(a.datum.slice(0, 10), b.r.datum) <= 60,
      );
      if (art === 'upsell' || neuerDeal || ((art === 'retainer' || art === 'sonstiges') && vorher != null && n > vorher * 1.05)) kundenart = 'upsell';
    }
    if (art === 'retainer') letzterMonat.set(b.kundeKey, n);
    const abschluss = abschlussZuKunde(b.kundeName, e.abschluesse);
    zeilen.push({ r: b.r, netto: n, kundeKey: b.kundeKey, kundeName: b.kundeName, kunde: b.kunde, art, kundenart, quelle: quellenKategorie(abschluss?.quelle) });
  }
  return zeilen;
}

const KUNDENART_LABEL: Record<Kundenart, string> = { neukunde: 'Neukunde', bestand: 'Bestandskunde', upsell: 'Upsell/Verlängerung' };
const ART_LABEL: Record<Umsatzart, string> = { setup: 'Setup', retainer: 'Monatsbetrag', upsell: 'Upsell/Zusatz', sonstiges: 'Sonstiges' };

function summen(zeilen: Zeile[]) {
  const gestellt = r2(zeilen.reduce((s, z) => s + z.netto, 0));
  const bezahlt = r2(zeilen.filter((z) => z.r.status !== 'open').reduce((s, z) => s + z.netto, 0));
  return { gestellt, bezahlt, offen: r2(gestellt - bezahlt), rechnungen: zeilen.length };
}

function gruppiere<K extends string>(zeilen: Zeile[], key: (z: Zeile) => K, label: (k: K) => string = (k) => k) {
  const m = new Map<K, number>();
  for (const z of zeilen) m.set(key(z), (m.get(key(z)) ?? 0) + z.netto);
  const gesamt = zeilen.reduce((s, z) => s + z.netto, 0);
  return [...m.entries()]
    .map(([k, v]) => ({ key: k, label: label(k), betrag: r2(v), anteil: gesamt > 0 ? Math.round((v / gesamt) * 1000) / 10 : 0 }))
    .sort((a, b) => b.betrag - a.betrag);
}

const veraenderung = (jetzt: number, vorher: number) => (vorher > 0 ? Math.round(((jetzt - vorher) / vorher) * 1000) / 10 : null);

/** Laufender Monatsumsatz aktiver Kunden und entgangener Monatsumsatz durch Abwanderung */
export function mrr(kunden: Kunde[]) {
  const aktiv = kunden.filter((k) => !INAKTIV.includes(k.fulfillment_phase ?? ''));
  const weg = kunden.filter((k) => INAKTIV.includes(k.fulfillment_phase ?? ''));
  return {
    mrr: r2(aktiv.reduce((s, k) => s + (k.mrr ?? 0), 0)),
    aktiveKunden: aktiv.length,
    kundenMitMrr: aktiv.filter((k) => (k.mrr ?? 0) > 0).length,
    abwanderung: { kunden: weg.length, entgangenerMrr: r2(weg.reduce((s, k) => s + (k.mrr ?? 0), 0)), namen: weg.map((k) => k.name) },
  };
}

export function berechneUmsatz(e: UmsatzEingaben) {
  const alle = klassifiziere(e);
  const imZeitraum = alle.filter((z) => drin(z.r.datum, e.zeitraum));
  const vorher = alle.filter((z) => drin(z.r.datum, e.vorperiode));

  const jetztSum = summen(imZeitraum);
  const vorSum = summen(vorher);

  // Monatsverlauf: Monate des Zeitraums, mindestens die letzten 12
  const monate: string[] = [];
  const startMonat = [e.zeitraum.von.slice(0, 7), plusTage(e.heute, -335).slice(0, 7)].sort()[0];
  for (let d = new Date(`${startMonat}-01T12:00:00Z`); d.toISOString().slice(0, 7) <= e.heute.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) {
    monate.push(d.toISOString().slice(0, 7));
  }
  const verlauf = monate.map((m) => {
    const z = alle.filter((x) => x.r.datum.slice(0, 7) === m);
    const s = summen(z);
    const teil = (k: Kundenart) => r2(z.filter((x) => x.kundenart === k).reduce((a, x) => a + x.netto, 0));
    return { monat: m, ...s, neukunde: teil('neukunde'), bestand: teil('bestand'), upsell: teil('upsell') };
  });

  // Kunden-Ranking und Konzentration
  const jeKunde = gruppiere(imZeitraum, (z) => z.kundeKey, (k) => imZeitraum.find((z) => z.kundeKey === k)?.kundeName ?? k);
  const top3Anteil = Math.round(jeKunde.slice(0, 3).reduce((s, k) => s + k.anteil, 0) * 10) / 10;

  const kundenMitUmsatz = new Set(imZeitraum.map((z) => z.kundeKey));
  const m = mrr(e.kunden);

  // Lebensdauer bisher (aktive Kunden, ab erster Rechnung bzw. Vertragsstart)
  const ersteRechnung = new Map<string, string>();
  for (const z of alle) {
    const cur = ersteRechnung.get(z.kundeKey);
    if (!cur || z.r.datum < cur) ersteRechnung.set(z.kundeKey, z.r.datum);
  }
  const lebensdauer = e.kunden
    .filter((k) => !INAKTIV.includes(k.fulfillment_phase ?? ''))
    .map((k) => [k.vertragsstart, ersteRechnung.get(k.id)].filter((x): x is string => !!x).sort()[0])
    .filter((x): x is string => !!x)
    .map((s) => tageZwischen(s, e.heute) / 30.4);

  // Umsatz aus Kunden über der ersten Vertragslaufzeit hinaus (= verlängert)
  const verlaengert = imZeitraum.filter((z) => {
    const s = ersteRechnung.get(z.kundeKey);
    const lz = z.kunde?.laufzeit_monate;
    return s && lz && tageZwischen(s, z.r.datum) > lz * 30.4;
  });

  // Abgleich: in Close gewonnenes Volumen vs. in Rechnung gestellt
  const gewonnen = e.abschluesse.filter((a) => drin(a.datum.slice(0, 10), e.zeitraum));
  const gewonnenSumme = r2(gewonnen.reduce((s, a) => s + a.wert, 0));
  const neukundenUmsatz = r2(imZeitraum.filter((z) => z.kundenart === 'neukunde').reduce((s, z) => s + z.netto, 0));
  const ohneRechnung = gewonnen
    .filter((a) => a.lead_name && !alle.some((z) => passtZu(z.kundeName, a.lead_name!) && z.r.datum >= a.datum.slice(0, 10)))
    .map((a) => ({ name: a.lead_name!, wert: a.wert, datum: a.datum.slice(0, 10) }));

  return {
    zeitraum: e.zeitraum,
    vorperiode: e.vorperiode,
    summen: { ...jetztSum, vorperiode: vorSum, veraenderung: veraenderung(jetztSum.gestellt, vorSum.gestellt) },
    nettoGeschaetzt: imZeitraum.filter((z) => z.r.netto == null).length,
    verlauf,
    kundenart: gruppiere(imZeitraum, (z) => z.kundenart, (k) => KUNDENART_LABEL[k]),
    kundenartVorperiode: gruppiere(vorher, (z) => z.kundenart, (k) => KUNDENART_LABEL[k]),
    art: gruppiere(imZeitraum, (z) => z.art, (k) => ART_LABEL[k]),
    quelle: gruppiere(imZeitraum, (z) => z.quelle),
    paket: gruppiere(imZeitraum, (z) => z.kunde?.paket || 'Ohne Paket'),
    kunden: { liste: jeKunde.slice(0, 15), anzahl: jeKunde.length, top3Anteil, konzentrationsrisiko: top3Anteil >= 50 },
    ohneZuordnung: r2(imZeitraum.filter((z) => !z.kunde).reduce((s, z) => s + z.netto, 0)),
    kennzahlen: {
      ...m,
      schnittProKunde: kundenMitUmsatz.size ? r2(jetztSum.gestellt / kundenMitUmsatz.size) : null,
      lebensdauerMonate: lebensdauer.length ? Math.round((lebensdauer.reduce((a, b) => a + b, 0) / lebensdauer.length) * 10) / 10 : null,
      umsatzVerlaengert: r2(verlaengert.reduce((s, z) => s + z.netto, 0)),
      kundenVerlaengert: new Set(verlaengert.map((z) => z.kundeKey)).size,
    },
    abgleich: {
      closeVerbunden: e.closeVerbunden,
      gewonnen: gewonnenSumme,
      deals: gewonnen.length,
      neukundenUmsatz,
      quote: gewonnenSumme > 0 ? Math.round((neukundenUmsatz / gewonnenSumme) * 1000) / 10 : null,
      ohneRechnung: ohneRechnung.slice(0, 20),
    },
  };
}

export type UmsatzAnalyse = ReturnType<typeof berechneUmsatz>;

/** Zeitraum aus Auswahl: monat | quartal | jahr | 12m (heute = YYYY-MM-DD) */
export function zeitraumFuer(auswahl: string, heute: string): { zeitraum: Zeitraum; vorperiode: Zeitraum; label: string } {
  const [y, mo] = heute.split('-').map(Number);
  const iso = (yy: number, mm: number) => new Date(Date.UTC(yy, mm - 1, 1)).toISOString().slice(0, 10);
  if (auswahl === 'monat') {
    return { zeitraum: { von: iso(y, mo), bis: iso(y, mo + 1) }, vorperiode: { von: iso(y, mo - 1), bis: iso(y, mo) }, label: 'Dieser Monat' };
  }
  if (auswahl === 'quartal') {
    const q = Math.floor((mo - 1) / 3) * 3 + 1;
    return { zeitraum: { von: iso(y, q), bis: iso(y, q + 3) }, vorperiode: { von: iso(y, q - 3), bis: iso(y, q) }, label: 'Dieses Quartal' };
  }
  if (auswahl === 'jahr') {
    return { zeitraum: { von: iso(y, 1), bis: iso(y + 1, 1) }, vorperiode: { von: iso(y - 1, 1), bis: iso(y, 1) }, label: `Jahr ${y}` };
  }
  // letzte 12 Monate inkl. laufendem Monat
  return { zeitraum: { von: iso(y, mo - 11), bis: iso(y, mo + 1) }, vorperiode: { von: iso(y, mo - 23), bis: iso(y, mo - 11) }, label: 'Letzte 12 Monate' };
}
