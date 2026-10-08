/**
 * Die vier Bausteine jedes Akademie-Themas: Video, SOP, Checkliste (abhaken während der Arbeit)
 * und Review-Checkliste (Qualitätsprüfung danach). Ohne eigene Listen werden sie aus der SOP
 * abgeleitet (Schritte → Checkliste, Qualität + Fehler → Review). Rein, auch im Client nutzbar.
 */

import type { ArtikelTyp, SopAbschnitte } from './inhalte';

type Basis = { typ: ArtikelTyp; abschnitte?: SopAbschnitte | null };

/** Leerraum in Listenpunkten vereinheitlichen */
const sauber = (s: string) => s.replace(/\s+/g, ' ').trim();

const STANDARD_CHECKLISTE: Record<ArtikelTyp, string[]> = {
  sop: ['SOP gelesen', 'Aufgabe nach den Schritten erledigt', 'Ergebnis in der Cloud dokumentiert'],
  skript: [
    'Profil, Notizen und Verlauf vorher gelesen',
    'Ziel des Gesprächs festgelegt (was soll am Ende stehen?)',
    'Ruhige Umgebung, Headset, Leitfaden offen',
    'Gespräch nach Leitfaden geführt, Bedarf in eigenen Worten zusammengefasst',
    'Nächsten Schritt mit Datum vereinbart',
    'Ergebnis direkt dokumentiert (Cloud/Close)',
  ],
  rolle: [
    'Tagesstart: Meine Aufgaben und überfällige Punkte geprüft',
    'Tagesziele meiner Rolle kenne ich (siehe Zielvorgaben)',
    'Alle Vorgänge des Tages dokumentiert',
    'Feierabend-Check gemacht (offene Übergaben, Status gesetzt)',
  ],
  wissen: ['Artikel vollständig gelesen', 'Unklare Punkte im Akademie-Bot gefragt oder an Felix gegeben'],
  faq: ['Antwort gelesen', 'Bei Abweichungen im echten Fall: Felix bzw. Führung informiert'],
};

const STANDARD_REVIEW: Record<ArtikelTyp, string[]> = {
  sop: [
    'Ergebnis ist in der Cloud sichtbar (Status, Kommentar oder Datei)',
    'Was die Cloud automatisch erledigen sollte, ist passiert – sonst gemeldet',
    'Nächster Schritt bzw. Übergabe ist klar',
    'Keine offene Rückfrage an Kunde oder Kollegen',
  ],
  skript: [
    'Der Gesprächspartner hat mehr geredet als ich',
    'Ich habe nach Bedarf und Situation gefragt, bevor ich etwas angeboten habe',
    'Einwände habe ich aufgenommen statt übergangen',
    'Es gibt einen klaren, terminierten nächsten Schritt',
    'Die Dokumentation reicht, damit jemand anderes nahtlos weitermachen kann',
  ],
  rolle: [
    'Meine Zielvorgaben dieser Woche erreicht – sonst Grund notiert',
    'Keine Aufgabe ist ohne Kommentar überfällig',
    'Übergaben an Kollegen waren vollständig',
  ],
  wissen: ['Ich kann den Inhalt in eigenen Worten erklären', 'Ich weiß, wo ich nachschlage, wenn der Fall eintritt'],
  faq: ['Ich kann die Frage einem Kunden/Kollegen korrekt beantworten'],
};

/** Checkliste zum Abarbeiten (Baustein 3) */
export function checklisteVon(a: Basis): string[] {
  const ab = a.abschnitte ?? {};
  if (ab.checkliste?.length) return ab.checkliste.map(sauber);
  if (a.typ === 'sop' && ab.schritte?.length) return ab.schritte.map(sauber);
  return STANDARD_CHECKLISTE[a.typ] ?? [];
}

/** Review-Checkliste (Baustein 4): Qualität + vermiedene Fehler */
export function reviewVon(a: Basis): string[] {
  const ab = a.abschnitte ?? {};
  if (ab.review?.length) return ab.review.map(sauber);
  const liste = [
    ...(ab.qualitaet ?? []).map(sauber),
    ...(ab.fehler ?? []).map((f) => `Vermieden: ${sauber(f).replace(/\.$/, '')}`),
  ];
  return liste.length ? liste : STANDARD_REVIEW[a.typ] ?? [];
}

/** Bausteine fest in die Abschnitte schreiben (Seed) – vorhandene eigene Listen bleiben */
export function mitBausteinen<T extends Basis>(a: T): T {
  const ab = { ...(a.abschnitte ?? {}) };
  ab.checkliste = checklisteVon(a);
  ab.review = reviewVon(a);
  return { ...a, abschnitte: ab };
}

/** Offene Punkte einer Checkliste (Indizes der abgehakten Punkte) */
export function offenePunkte(liste: string[], abgehakt: number[]): string[] {
  const set = new Set(abgehakt);
  return liste.filter((_, i) => !set.has(i));
}
