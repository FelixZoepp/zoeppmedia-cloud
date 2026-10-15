/**
 * Zeiterfassung – reine Rechenfunktionen (ohne Datenbank): Dauer, Überschneidungen, Monatssummen, CSV.
 * Zeitstempel sind ISO-Strings (UTC), Kalendertage 'YYYY-MM-DD' und Monate 'YYYY-MM' in Berliner Zeit.
 */
import { berlinMitternacht, berlinTagVon, berlinUhrzeit, tagTeile } from '@/lib/zeit/berlin';

export const TAETIGKEITEN = [
  { value: 'anrufe', label: 'Anrufe' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'kampagne', label: 'Kampagne' },
  { value: 'funnel', label: 'Funnel' },
  { value: 'support', label: 'Support' },
  { value: 'sales', label: 'Sales' },
  { value: 'intern', label: 'Intern' },
  { value: 'sonstiges', label: 'Sonstiges' },
] as const;

export type Taetigkeit = (typeof TAETIGKEITEN)[number]['value'];

export function istTaetigkeit(v: unknown): v is Taetigkeit {
  return typeof v === 'string' && TAETIGKEITEN.some((t) => t.value === v);
}

export function taetigkeitLabel(v: string): string {
  return TAETIGKEITEN.find((t) => t.value === v)?.label ?? v;
}

/** Stoppuhren, die länger laufen, gelten als vergessen und werden zur Korrektur markiert */
export const MAX_LAUF_MINUTEN = 10 * 60;
/** Obergrenze für einen einzelnen Eintrag (Tippfehler abfangen) */
export const MAX_EINTRAG_MINUTEN = 16 * 60;
export const STANDARD_STUNDENSATZ = 35;

export interface Zeiteintrag {
  id: string;
  user_id: string;
  agency_id: string | null;
  taetigkeit: string;
  start: string;
  ende: string | null;
  minuten: number | null;
  notiz: string | null;
}

/** Ganze Minuten zwischen zwei Zeitpunkten (abgerundet wie in der Datenbank, nie negativ) */
export function minutenZwischen(start: string | Date, ende: string | Date): number {
  const ms = new Date(ende).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 60_000) : 0;
}

/** Dauer eines Eintrags – laufende Stoppuhr bis „jetzt“ */
export function eintragMinuten(e: Pick<Zeiteintrag, 'start' | 'ende' | 'minuten'>, jetzt: Date = new Date()): number {
  if (e.ende) return e.minuten ?? minutenZwischen(e.start, e.ende);
  return minutenZwischen(e.start, jetzt);
}

/** Läuft zu lange (vergessene Stoppuhr) oder wurde mit > 10 h gestoppt → bitte prüfen */
export function istUeberlang(e: Pick<Zeiteintrag, 'start' | 'ende' | 'minuten'>, jetzt: Date = new Date()): boolean {
  return eintragMinuten(e, jetzt) > MAX_LAUF_MINUTEN;
}

/**
 * Dauer-Eingabe → Minuten. Erlaubt „1:30“, „01:30“, „1,5“ / „1.5“ (Stunden), „90m“, „2h“.
 * Eine nackte Zahl ohne Einheit gilt als Stunden, wenn ≤ 16, sonst als Minuten. null = ungültig oder 0.
 */
export function dauerParsen(eingabe: string): number | null {
  const s = eingabe.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let min: number | null = null;
  const hm = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  if (hm) {
    if (Number(hm[2]) > 59) return null;
    min = Number(hm[1]) * 60 + Number(hm[2]);
  } else if (/^\d+m(in)?$/.test(s)) {
    min = parseInt(s, 10);
  } else if (/^\d+([.,]\d+)?h$/.test(s)) {
    min = Math.round(parseFloat(s.replace(',', '.')) * 60);
  } else if (/^\d+([.,]\d+)?$/.test(s)) {
    const n = parseFloat(s.replace(',', '.'));
    min = n <= 16 ? Math.round(n * 60) : Math.round(n);
  }
  if (min === null || !Number.isFinite(min) || min <= 0 || min > MAX_EINTRAG_MINUTEN) return null;
  return min;
}

/** Minuten → „h:mm“ (z. B. 95 → „1:35“) */
export function dauerFormat(minuten: number): string {
  const m = Math.max(0, Math.round(minuten));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Minuten → Stunden mit zwei Nachkommastellen (für CSV/Kosten) */
export function stunden(minuten: number): number {
  return Math.round((minuten / 60) * 100) / 100;
}

/** Kosten in € (auf Cent gerundet) */
export function kosten(minuten: number, stundensatz: number): number {
  return Math.round((minuten / 60) * stundensatz * 100) / 100;
}

/** Stundensatz aus system_einstellungen ('35', '42,50') – ungültig → Standard 35 € */
export function stundensatzAusWert(wert: string | null | undefined): number {
  const n = parseFloat(String(wert ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : STANDARD_STUNDENSATZ;
}

/** Uhrzeit 'HH:MM' → { h, min } oder null */
export function uhrzeitTeile(uhrzeit: string): { h: number; min: number } | null {
  const t = /^(\d{1,2}):(\d{2})$/.exec(uhrzeit.trim());
  if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) return null;
  return { h: Number(t[1]), min: Number(t[2]) };
}

/**
 * Beginn für einen nachgetragenen Eintrag: mit Uhrzeit genau dort, sonst direkt nach dem letzten Eintrag
 * desselben Tages (damit nichts überlappt), ohne Einträge um 09:00 Uhr. null = Tag/Uhrzeit ungültig.
 */
export function nachtragStart(tag: string, ab: string | null | undefined, eintraegeDesTages: Array<Pick<Zeiteintrag, 'start' | 'ende'>>): string | null {
  const t = tagTeile(tag);
  if (!t) return null;
  if (ab) {
    const u = uhrzeitTeile(ab);
    if (!u) return null;
    return berlinUhrzeit(t.y, t.m, t.d, u.h, u.min).toISOString();
  }
  const enden = eintraegeDesTages
    .filter((e) => e.ende && berlinTagVon(e.start) === tag)
    .map((e) => new Date(e.ende!).getTime());
  if (enden.length) return new Date(Math.max(...enden)).toISOString();
  return berlinUhrzeit(t.y, t.m, t.d, 9, 0).toISOString();
}

/** Ids der Einträge, die sich zeitlich mit einem anderen Eintrag (desselben Mitarbeiters) überschneiden */
export function ueberschneidungen(eintraege: Zeiteintrag[], jetzt: Date = new Date()): Set<string> {
  const treffer = new Set<string>();
  const proUser = new Map<string, Array<{ id: string; a: number; b: number }>>();
  for (const e of eintraege) {
    const a = new Date(e.start).getTime();
    const b = e.ende ? new Date(e.ende).getTime() : jetzt.getTime();
    const liste = proUser.get(e.user_id) ?? [];
    liste.push({ id: e.id, a, b });
    proUser.set(e.user_id, liste);
  }
  for (const liste of proUser.values()) {
    liste.sort((x, y) => x.a - y.a);
    let offen = liste[0];
    for (let i = 1; i < liste.length; i++) {
      const cur = liste[i];
      if (offen && cur.a < offen.b) {
        treffer.add(cur.id);
        treffer.add(offen.id);
      }
      if (!offen || cur.b > offen.b) offen = cur;
    }
  }
  return treffer;
}

/** 'YYYY-MM' gültig? */
export function istMonat(monat: string): boolean {
  const t = /^(\d{4})-(\d{2})$/.exec(monat);
  return !!t && Number(t[2]) >= 1 && Number(t[2]) <= 12;
}

/** Monat (Berlin) → UTC-Grenzen [ab, bis) für Datenbankabfragen */
export function monatsGrenzen(monat: string): { ab: string; bis: string } {
  if (!istMonat(monat)) throw new Error(`Ungültiger Monat: ${monat}`);
  const y = Number(monat.slice(0, 4));
  const m = Number(monat.slice(5, 7));
  return { ab: berlinMitternacht(y, m, 1).toISOString(), bis: berlinMitternacht(y, m + 1, 1).toISOString() };
}

/** Aktueller Monat in Berlin als 'YYYY-MM' */
export function aktuellerMonat(jetzt: Date = new Date()): string {
  return berlinTagVon(jetzt.toISOString()).slice(0, 7);
}

export interface Summe {
  minuten: number;
  kosten: number;
  eintraege: number;
}

export interface MonatsAuswertung {
  proMitarbeiter: Array<Summe & { userId: string; proTaetigkeit: Record<string, number> }>;
  /** agencyId null = intern (kein Kunde) */
  proKunde: Array<Summe & { agencyId: string | null; proTaetigkeit: Record<string, number> }>;
  gesamt: Summe;
  /** Laufende Stoppuhren zählen erst nach dem Stoppen */
  laufend: number;
  /** Einträge > 10 h – vor der Abrechnung prüfen */
  zuPruefen: number;
}

/** Abgeschlossene Einträge eines Monats summieren – je Mitarbeiter und je Kunde (nach Minuten absteigend) */
export function monatAuswerten(eintraege: Zeiteintrag[], stundensatz: number, jetzt: Date = new Date()): MonatsAuswertung {
  const ma = new Map<string, { minuten: number; eintraege: number; proTaetigkeit: Record<string, number> }>();
  const ku = new Map<string | null, { minuten: number; eintraege: number; proTaetigkeit: Record<string, number> }>();
  let laufend = 0;
  let zuPruefen = 0;
  let gesamtMin = 0;
  let gesamtN = 0;
  const add = <K>(map: Map<K, { minuten: number; eintraege: number; proTaetigkeit: Record<string, number> }>, key: K, e: Zeiteintrag, min: number) => {
    const s = map.get(key) ?? { minuten: 0, eintraege: 0, proTaetigkeit: {} };
    s.minuten += min;
    s.eintraege += 1;
    s.proTaetigkeit[e.taetigkeit] = (s.proTaetigkeit[e.taetigkeit] ?? 0) + min;
    map.set(key, s);
  };
  for (const e of eintraege) {
    if (istUeberlang(e, jetzt)) zuPruefen++;
    if (!e.ende) {
      laufend++;
      continue;
    }
    const min = eintragMinuten(e, jetzt);
    gesamtMin += min;
    gesamtN++;
    add(ma, e.user_id, e, min);
    add(ku, e.agency_id, e, min);
  }
  return {
    proMitarbeiter: [...ma.entries()]
      .map(([userId, s]) => ({ userId, ...s, kosten: kosten(s.minuten, stundensatz) }))
      .sort((a, b) => b.minuten - a.minuten),
    proKunde: [...ku.entries()]
      .map(([agencyId, s]) => ({ agencyId, ...s, kosten: kosten(s.minuten, stundensatz) }))
      .sort((a, b) => b.minuten - a.minuten),
    gesamt: { minuten: gesamtMin, kosten: kosten(gesamtMin, stundensatz), eintraege: gesamtN },
    laufend,
    zuPruefen,
  };
}

/** Summe der abgeschlossenen + laufenden Minuten ab einem Zeitpunkt (z. B. Wochenbeginn) */
export function summeAb(eintraege: Zeiteintrag[], ab: Date, jetzt: Date = new Date()): number {
  return eintraege.filter((e) => new Date(e.start) >= ab).reduce((s, e) => s + eintragMinuten(e, jetzt), 0);
}

/** CSV-Feld (Semikolon-getrennt, wie Excel in Deutschland erwartet) */
function feld(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Zeilen → CSV mit Kopfzeile, Semikolon, Dezimalkomma, CRLF; BOM vorne, damit Excel Umlaute erkennt */
export function csv(kopf: string[], zeilen: Array<Array<string | number | null | undefined>>): string {
  return '﻿' + [kopf, ...zeilen].map((z) => z.map(feld).join(';')).join('\r\n') + '\r\n';
}
