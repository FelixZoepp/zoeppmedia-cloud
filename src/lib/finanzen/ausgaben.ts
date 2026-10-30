/**
 * Ausgaben im Cash-Plan: Kartenumsätze (Amex-CSV) + feste Kosten (Mitarbeiter …), segmentiert nach Kategorie.
 * Rein, testbar – Speichern in finanz_ausgaben / finanz_fixkosten über die Admin-API.
 */

import { monatKey } from './cashplan';

export const KATEGORIEN = [
  'Mitarbeiter',
  'Werbung',
  'Software & Tools',
  'Auto & Mobilität',
  'Technik & Miete',
  'Material & Büro',
  'Reisen & Hotel',
  'Essen & Bewirtung',
  'Freizeit & Sport',
  'Sonstiges',
] as const;
export type Kategorie = (typeof KATEGORIEN)[number];

const REGELN: Array<[Kategorie, RegExp]> = [
  ['Werbung', /FACEBK|FACEBOOK|META ?PLATF|INDEED|GOOGLE ?ADS|LINKEDIN|TIKTOK|SNAPCHAT/],
  ['Essen & Bewirtung', /UBER ?EATS|LIEFERANDO|WOLT|PREPMYMEAL|BEEF|CHICKEN|SELGROS|REWE|EDEKA|LIDL|ALDI|RESTAURANT|CAFE|BURGER|PIZZA|SUSHI|STARBUCKS|SPAETKAUF|SPÄTKAUF|BÄCKER|BAECKER/],
  ['Auto & Mobilität', /SIXT|TANK|SHELL|ARAL|ESSO|\bJET\b|TOTALENERG|AGIP|PARKEN|PARKHAUS|BVG|\bDB\b|BAHN|UBER ?TRIP|\bUBER\b|BOLT|FREENOW|MILES MOB|SHARE NOW|TESLA/],
  ['Technik & Miete', /GROVER/],
  ['Material & Büro', /AMZN|AMAZON|IKEA|MEDIAMARKT|SATURN|OTTO/],
  ['Reisen & Hotel', /HOTEL|BOOKING\.COM|AIRBNB|LUFTHANSA|EUROWINGS|RYANAIR|EASYJET/],
  ['Freizeit & Sport', /PLAYTOMIC|PADEL|FITNESS|GYM|URBAN SPORTS|EVENT/],
  [
    'Software & Tools',
    /MIRO|MANYCHAT|1PASSWORD|PERSPECTIVE|ADOBE|CALENDLY|ZOOM|ZAPIER|MEMBERSPOT|OPENAI|CHATGPT|VEED|MONDAY|CLOSE CRM|NORTH DATA|ONEPAGE|ATLASSIAN|CLOCKODO|GOOGLE|APPLE\.COM|ANTHROPIC|CLAUDE|VERCEL|SUPABASE|GITHUB|NOTION|SLACK|CANVA|FIREFLIES|HIGGSFIELD|ELEVENLABS|MSFT|MICROSOFT|DROPBOX|LEXOFFICE|LEXWARE|TWILIO|HETZNER|IONOS|STRATO|APIFY|CLAY|AIRTABLE|ACTIVECAMPAIGN|CURSOR|CAPCUT|LOOM|DESCRIPT|TYPEFORM|MAKE\.COM|SEMRUSH|HUBSPOT|RESEND|BREVO|DOCUSIGN|MANATAL|BUFFER/,
  ],
];

export function kategorisiere(haendler: string): Kategorie {
  const h = haendler.toUpperCase();
  for (const [k, rx] of REGELN) if (rx.test(h)) return k;
  return 'Sonstiges';
}

export interface AusgabeImport {
  schluessel: string;
  datum: string;
  haendler: string;
  betrag: number;
  kategorie: Kategorie;
  quelle: string;
  beleg: string | null;
}

const zahl = (s: string) => {
  const t = s.trim().replace(/["€\s]/g, '');
  // 1.234,56 (DE) oder 1234.56 (EN)
  const n = /,\d{1,2}$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

const datumIso = (s: string): string | null => {
  const t = s.trim().replace(/"/g, '');
  let m = t.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
};

function spalten(zeile: string, trenner: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const ch of zeile) {
    if (ch === '"') q = !q;
    else if (ch === trenner && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/**
 * Amex-CSV (Onlinekonto → Umsätze → Herunterladen): Spalten „Datum“, „Beschreibung“, „Betrag“ (deutsch oder englisch).
 * Zahlungen an Amex werden übersprungen; Gutschriften bleiben negativ.
 */
export function leseAmexCsv(text: string, beleg: string | null = null): { zeilen: AusgabeImport[]; fehler: string | null } {
  const roh = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (roh.length < 2) return { zeilen: [], fehler: 'Datei ist leer' };
  const trenner = (roh[0].match(/;/g)?.length ?? 0) > (roh[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const kopf = spalten(roh[0], trenner).map((k) => k.toLowerCase());
  const iDatum = kopf.findIndex((k) => k === 'datum' || k === 'date');
  const iText = kopf.findIndex((k) => k.startsWith('beschreibung') || k.startsWith('description'));
  const iBetrag = kopf.findIndex((k) => k === 'betrag' || k === 'amount' || k.startsWith('betrag'));
  if (iDatum < 0 || iText < 0 || iBetrag < 0) return { zeilen: [], fehler: 'Spalten „Datum“, „Beschreibung“ und „Betrag“ nicht gefunden' };
  const zeilen: AusgabeImport[] = [];
  const zaehler = new Map<string, number>();
  for (const l of roh.slice(1)) {
    const s = spalten(l, trenner);
    const datum = datumIso(s[iDatum] ?? '');
    const haendler = (s[iText] ?? '').replace(/\s+/g, ' ').trim();
    const betrag = zahl(s[iBetrag] ?? '');
    if (!datum || !haendler || !Number.isFinite(betrag)) continue;
    if (/ZAHLUNG.*ERHALTEN|PAYMENT RECEIVED|LASTSCHRIFT/i.test(haendler)) continue;
    const basis = `amex|${datum}|${haendler}|${betrag.toFixed(2)}`;
    const nr = (zaehler.get(basis) ?? 0) + 1;
    zaehler.set(basis, nr);
    zeilen.push({ schluessel: `${basis}|${nr}`, datum, haendler, betrag, kategorie: kategorisiere(haendler), quelle: 'amex', beleg });
  }
  return { zeilen, fehler: zeilen.length ? null : 'Keine Umsätze erkannt' };
}

export interface Ausgabe {
  id: string;
  datum: string;
  haendler: string;
  betrag: number;
  kategorie: string;
  privat: boolean;
  quelle: string;
}

export interface Fixkosten {
  id: string;
  name: string;
  kategorie: string;
  monatlich: number;
  ab: string;
  bis: string | null;
  notiz: string | null;
}

export const fixImMonat = (f: Fixkosten, monat: string) => monatKey(f.ab) <= monat && (!f.bis || monatKey(f.bis) >= monat);

export interface AusgabenMonat {
  gesamt: number;
  privat: number;
  /** Je Kategorie, größte zuerst */
  proKategorie: Array<{ kategorie: string; betrag: number; anteil: number; posten: number }>;
  /** Größte Händler (ohne privat) */
  topHaendler: Array<{ haendler: string; betrag: number; posten: number }>;
  /** Kartenumsätze vorhanden? (sonst nur Fixkosten) */
  mitKarte: boolean;
}

/** Händlername ohne Belegnummern (FACEBK *4MTV3BNSQ4 → FACEBK) */
export const haendlerGruppe = (h: string) => h.replace(/\*.*$/, '').replace(/\s+(GMBH|INC\.?|LTD|LIMITED|B\.V\.|S\.A\.).*$/i, '').split(/\s{2,}/)[0].trim().slice(0, 40);

export function ausgabenImMonat(ausgaben: Ausgabe[], fix: Fixkosten[], monat: string): AusgabenMonat {
  const kat = new Map<string, { betrag: number; posten: number }>();
  const haendler = new Map<string, { betrag: number; posten: number }>();
  let privat = 0;
  let mitKarte = false;
  for (const a of ausgaben) {
    if (monatKey(a.datum) !== monat) continue;
    mitKarte = true;
    if (a.privat) {
      privat += a.betrag;
      continue;
    }
    const k = kat.get(a.kategorie) ?? { betrag: 0, posten: 0 };
    k.betrag += a.betrag;
    k.posten++;
    kat.set(a.kategorie, k);
    const g = haendlerGruppe(a.haendler);
    const h = haendler.get(g) ?? { betrag: 0, posten: 0 };
    h.betrag += a.betrag;
    h.posten++;
    haendler.set(g, h);
  }
  for (const f of fix) {
    if (!fixImMonat(f, monat)) continue;
    const k = kat.get(f.kategorie) ?? { betrag: 0, posten: 0 };
    k.betrag += f.monatlich;
    k.posten++;
    kat.set(f.kategorie, k);
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const gesamt = r2([...kat.values()].reduce((s, k) => s + k.betrag, 0));
  return {
    gesamt,
    privat: r2(privat),
    proKategorie: [...kat.entries()]
      .map(([kategorie, k]) => ({ kategorie, betrag: r2(k.betrag), anteil: gesamt ? k.betrag / gesamt : 0, posten: k.posten }))
      .sort((a, b) => b.betrag - a.betrag),
    topHaendler: [...haendler.entries()]
      .map(([h, x]) => ({ haendler: h, betrag: r2(x.betrag), posten: x.posten }))
      .sort((a, b) => b.betrag - a.betrag)
      .slice(0, 10),
    mitKarte,
  };
}
