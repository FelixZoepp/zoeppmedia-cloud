/**
 * Start-Inhalte der Team-Akademie. Werden beim ersten Aufruf in akademie_artikel / akademie_videos
 * angelegt (nur fehlende Einträge) – danach gilt die Datenbank, Admins bearbeiten dort.
 *
 * Grundsatz: SOPs beschreiben, was die Cloud/KI laut Code schon selbst erledigt und was ein Mensch tun
 * oder prüfen muss. Firmenwissen, das nicht aus Code/Daten ableitbar ist (Skripte, Tagesabläufe),
 * steht als Entwurf mit Leitfragen „Felix ergänzt: …“ – nichts davon ist erfunden.
 */

import { STANDARD_SCHWELLEN as S } from '@/lib/sales-controlling/auslastung';
import { mitBausteinen } from './bausteine';
import { ARTIKEL_A_Z, VIDEOS_A_Z } from './inhalte-a-z';

export type ArtikelTyp = 'sop' | 'skript' | 'wissen' | 'faq' | 'rolle';
export type ArtikelStatus = 'entwurf' | 'freigegeben';

export interface SopAbschnitte {
  zweck?: string;
  ausloeser?: string;
  automatisch?: string[];
  schritte?: string[];
  qualitaet?: string[];
  fehler?: string[];
  links?: Array<{ label: string; href: string }>;
  /** Baustein 3: zum Abhaken während der Arbeit (pro Vorgang) */
  checkliste?: string[];
  /** Baustein 4: Qualitätsprüfung danach (Selbstcheck, optional Prüfung durch Führung) */
  review?: string[];
}

export interface ArtikelDef {
  slug: string;
  typ: ArtikelTyp;
  titel: string;
  modul: string;
  positionen: string[];
  step_keys?: string[];
  status: ArtikelStatus;
  zusammenfassung: string;
  abschnitte?: SopAbschnitte;
  inhalt?: string;
  video_key?: string;
  prioritaet?: number;
  reihenfolge?: number;
}

export interface VideoDef {
  key: string;
  titel: string;
  session: string;
  session_reihenfolge: number;
  laenge_min: number;
  prioritaet: number;
  drehbuch: string[];
  /** ideal mit „SOP aufnehmen“ (Bildschirm + Stimme → Video und SOP in einem) */
  sop_aufnahme?: boolean;
}

export const MODULE = [
  'Willkommen & Kultur',
  'Arbeitsweise & Regeln',
  'Grundlagen',
  'Abschluss & Zahlung',
  'Onboarding',
  'Setup',
  'Laufende Betreuung',
  'Recruiting-Cloud & Innendienst',
  'Vertrieb',
  'Finanzen',
  'Offboarding',
  'Innendienst',
  'Setting',
  'Closing',
  'Kundenbetreuung',
  'Handwerk Marketing',
  'Buchhaltung',
  'Operations',
  'Vertriebsleitung',
  'Rollen',
  'Skripte',
  'FAQ',
] as const;

/* ── Videos (gebündelt zu Aufnahme-Sessions) ─────────────────────────── */

const VIDEOS_BASIS: VideoDef[] = [
  {
    key: 'cloud_rundgang', titel: 'Rundgang durch die Zoepp Cloud', session: 'A · Cloud-Grundlagen', session_reihenfolge: 1, laenge_min: 5, prioritaet: 1,
    drehbuch: ['Seitenleiste: Bereiche je Rolle, Profil, Hilfe, Akademie', 'Cockpit/Heute: was morgens zuerst zählt', 'Kunden-Board: Phasen und aktueller Schritt je Kunde', 'KI-Assistent unten rechts: was er beantworten kann', 'Akademie: SOP suchen, Bot fragen, Fortschritt'],
  },
  {
    key: 'aufgaben_ablauf', titel: 'Meine Aufgaben & Kunden-Ablauf', session: 'A · Cloud-Grundlagen', session_reihenfolge: 2, laenge_min: 4, prioritaet: 1,
    drehbuch: ['Meine Aufgaben: Spalten, Filter, überfällig', 'Karte verschieben, „nicht nötig“ mit Begründung', 'Vom Kunden erledigt → „zur Prüfung“ und wie du prüfst', 'Kunden-Ablauf: Phasen, Schritte, Kommentare, Automatik-Karten', '„SOP ansehen“ an jeder Aufgabe'],
  },
  {
    key: 'after_close', titel: 'After-Close, Vertrag & Setup-Rechnung', session: 'B · Abschluss bis Onboarding', session_reihenfolge: 1, laenge_min: 4, prioritaet: 1,
    drehbuch: ['After-Close-Formular ausfüllen: Pflichtfelder, Paket, Preise, Garantieziel', 'Was danach automatisch passiert (Willkommens-Mail, Vertragslink)', 'Vertragsbestätigung des Kunden ansehen', 'Aufgabe „Setup-Rechnung“ und Rechnung in Lexware verknüpfen', 'Woran du siehst, dass die Zahlung erkannt wurde'],
  },
  {
    key: 'kickoff_call', titel: 'Kick-off-Call führen', session: 'B · Abschluss bis Onboarding', session_reihenfolge: 2, laenge_min: 6, prioritaet: 1,
    drehbuch: ['Vorbereitung: Briefing und Close-Notizen lesen', 'Gesprächsleitfaden durchgehen (siehe Skript Onboarding-Call)', 'Zugänge live gemeinsam freigeben lassen', 'Erwartungen und Garantie sauber festhalten', 'Nachbereitung: Transkript, nächste Schritte im Ablauf'],
  },
  {
    key: 'meta_zugaenge', titel: 'Meta-Zugänge prüfen & Systemnutzer zuweisen', session: 'B · Abschluss bis Onboarding', session_reihenfolge: 3, laenge_min: 6, prioritaet: 1,
    drehbuch: ['Meta-Automatik-Karte: „Zugänge prüfen“ und was die Cloud selbst prüft', 'Business Manager: Partner-Anfrage annehmen, Assets sehen', 'Systemnutzer dem Werbekonto zuweisen, Werbekonto-ID eintragen', 'Was tun bei „fehlt“: Hinweis an Kunden, häufige Ursachen', 'Indeed-Zugang und Weiterleitung kurz zeigen'],
  },
  {
    key: 'ads_werkstatt', titel: 'KI-Generator, Ads-Board & KI-Bilder', session: 'C · Setup-Werkstatt', session_reihenfolge: 1, laenge_min: 6, prioritaet: 1,
    drehbuch: ['Was der Generator nach dem Onboarding selbst erstellt', 'Ads-Board: Stufen idee → material → bearbeitung → Freigabe', 'KI-Bilder: Varianten, neu erzeugen, Variante wählen', 'Eigene Grafik/Video hochladen statt KI', 'KI-Prüfung lesen und Ad an den Kunden geben'],
  },
  {
    key: 'funnel_pruefen', titel: 'Funnel prüfen: Pixel, Webhook & Test-Lead', session: 'C · Setup-Werkstatt', session_reihenfolge: 2, laenge_min: 5, prioritaet: 1,
    drehbuch: ['Funnel-Karte: automatischer Bau über Perspective', 'In Perspective: Pixel des Kunden eintragen', 'Webhook prüfen (ohne ?agency= bei Vorlagen-Kopien)', 'Domain verbinden, falls gewünscht', 'Test-Lead durchspielen und Ergebnis lesen'],
  },
  {
    key: 'meta_kampagne', titel: 'Meta-Kampagne prüfen & starten', session: 'C · Setup-Werkstatt', session_reihenfolge: 3, laenge_min: 5, prioritaet: 1,
    drehbuch: ['Voraussetzungen der Automatik (Zugänge, Freigaben, Funnel, Budget)', 'Pausiert angelegte Kampagne im Werbemanager ansehen', 'Targeting (Sonderkategorie Beschäftigung), Budget, Anzeigen prüfen', '„Kampagne starten“ und was danach passiert', 'Meta-Fehler und Ablehnungen behandeln'],
  },
  {
    key: 'indeed', titel: 'Indeed-Anzeige & Bewerber-Weiterleitung', session: 'C · Setup-Werkstatt', session_reihenfolge: 4, laenge_min: 4, prioritaet: 2,
    drehbuch: ['KI-Indeed-Anzeige aus dem Generator übernehmen', 'Anzeige im Kunden-Konto einstellen', 'Weiterleitungsadresse bewerber+<Kunden-ID>@… eintragen', 'Was bei Indeed-Mails ankommt und was nicht (Lebenslauf)'],
  },
  {
    key: 'continuity_check', titel: 'Anzeigen + Tracking prüfen (Tag 7–75)', session: 'D · Laufende Betreuung', session_reihenfolge: 1, laenge_min: 5, prioritaet: 2,
    drehbuch: ['Welche Zahlen du je Check ansiehst (Leads, Kosten pro Lead, Bewerber, Termine)', 'Tracking-Kette prüfen: Funnel → Cloud → WhatsApp', 'Wann Anzeigen tauschen, wann Budget ändern', 'Ergebnis im Schritt kommentieren'],
  },
  {
    key: 'garantie_verlaengerung', titel: 'Garantie-Ampel, Umfragen & Verlängerung', session: 'D · Laufende Betreuung', session_reihenfolge: 2, laenge_min: 4, prioritaet: 2,
    drehbuch: ['Garantie-Ampel lesen: Anlauf, im Plan, gelb, rot', 'Was bei Rot automatisch passiert und was du tust', 'Umfrage-Folgeaufgaben: anrufen, Bewertung, Upsell', 'Verlängerungsaufgabe 30/14 Tage vorher vorbereiten'],
  },
  {
    key: 'innendienst', titel: 'Innendienst: Kunden-Clouds & Bewerber-Pipeline', session: 'E · Recruiting-Cloud', session_reihenfolge: 1, laenge_min: 6, prioritaet: 1,
    drehbuch: ['Innendienst-Übersicht und 1-Klick-Kunden-Login', 'Bewerber-Pipeline: Phasen, Notizen, Status', 'Termine anbieten und Buchungslink', 'Woran du siehst, was der Bot schon erledigt hat', 'Kunden-Cloud wieder verlassen'],
  },
  {
    key: 'dialer', titel: 'Dialer, Kadenz & Anruf-Aufgaben', session: 'E · Recruiting-Cloud', session_reihenfolge: 2, laenge_min: 4, prioritaet: 2,
    drehbuch: ['Warteschlange: fällige Anrufe und Rückrufe', 'Anruf protokollieren: Ergebnis, erneut anrufen', 'Wie die Kadenz neue Anruf-Aufgaben erzeugt', 'Speed-to-Lead im Blick behalten'],
  },
  {
    key: 'whatsapp_inbox', titel: 'WhatsApp-Inbox (Kunden & Sales)', session: 'E · Recruiting-Cloud', session_reihenfolge: 3, laenge_min: 3, prioritaet: 2,
    drehbuch: ['Gespräche, Filter, Leads/Kunden-Tabs', 'Antworten, Vorlagen außerhalb des 24-h-Fensters', 'Kontakt als Kunde oder Lead markieren', 'Wann der Bot schreibt und wann du übernimmst'],
  },
  {
    key: 'close_pflege', titel: 'Close-Pflege & Gesprächsprotokolle', session: 'F · Vertrieb', session_reihenfolge: 1, laenge_min: 4, prioritaet: 2,
    drehbuch: ['Status in Close richtig setzen (zählt fürs Controlling)', 'Follow-up-Rhythmus-Feld und was die Cloud daraus macht', 'KI-Gesprächsnotiz am Lead lesen', 'Aufgaben in Close statt im Kopf'],
  },
  {
    key: 'sales_controlling', titel: 'Sales-Controlling & Team-Auslastung lesen', session: 'F · Vertrieb', session_reihenfolge: 2, laenge_min: 4, prioritaet: 3,
    drehbuch: ['Zeitraum wählen, Ziel 300k Auftragsvolumen', 'Team & Auslastung: Ampeln Setter/Closer', 'No-Show-Rückholung und Follow-ups je Person', 'Wann ein neuer Setter/Closer nötig ist'],
  },
  {
    key: 'lexware_rechnung', titel: 'Setup-Rechnung in Lexware & Zahlungsabgleich', session: 'G · Buchhaltung', session_reihenfolge: 1, laenge_min: 3, prioritaet: 2,
    drehbuch: ['Aufgabe „Setup-Rechnung“ in Meine Aufgaben', 'Rechnung in Lexware an den richtigen Kontakt schreiben', 'Rechnungsnummer in der Cloud verknüpfen, falls nicht automatisch erkannt', 'Zahlungsabgleich über Qonto in Lexware'],
  },
];

/** Bildschirm-Tutorials: ideal mit „SOP aufnehmen“ (Bildschirm + Stimme → Video und SOP in einem) */
const PER_SOP_AUFNAHME = new Set(['cloud_rundgang', 'aufgaben_ablauf', 'after_close', 'meta_zugaenge', 'ads_werkstatt', 'funnel_pruefen', 'meta_kampagne', 'indeed', 'continuity_check', 'garantie_verlaengerung', 'innendienst', 'dialer', 'whatsapp_inbox', 'close_pflege', 'sales_controlling', 'lexware_rechnung']);

export const VIDEOS: VideoDef[] = [
  ...VIDEOS_BASIS.map((v) => ({ ...v, sop_aufnahme: v.sop_aufnahme ?? PER_SOP_AUFNAHME.has(v.key) })),
  ...VIDEOS_A_Z.map((v) => ({ ...v, sop_aufnahme: v.sop_aufnahme ?? false })),
];

/* ── Hilfen ──────────────────────────────────────────────────────────── */

const L = (label: string, href: string) => ({ label, href });
const ERGAENZT = (frage: string) => `> **Felix ergänzt:** ${frage}`;

/* ── SOPs ────────────────────────────────────────────────────────────── */

const SOPS: ArtikelDef[] = [
  // Grundlagen
  {
    slug: 'cloud-rundgang', typ: 'sop', titel: 'Die Zoepp Cloud im Überblick', modul: 'Grundlagen', positionen: ['grundlagen'], status: 'freigegeben', video_key: 'cloud_rundgang', prioritaet: 1, reihenfolge: 1,
    zusammenfassung: 'Wo du was findest: Seitenleiste je Rolle, Cockpit, Kunden-Board, Assistent und Akademie.',
    abschnitte: {
      zweck: 'Damit du dich in der Cloud zurechtfindest und weißt, wo deine Arbeit liegt.',
      ausloeser: 'Erster Arbeitstag oder wenn du einen Bereich nicht findest.',
      automatisch: ['Die Seitenleiste zeigt dir nur die Bereiche deiner Funktion.', 'Neue Aufgaben entstehen aus dem Kunden-Ablauf und landen bei der zuständigen Funktion.'],
      schritte: ['Öffne „Meine Aufgaben“ – das ist dein Startpunkt jeden Tag.', 'Über „Kunden“ siehst du alle Kunden mit Phase und aktuellem Schritt.', 'Fragen zur Bedienung: KI-Assistent unten rechts oder Akademie-Bot.', 'Fehlt dir ein Bereich, frag Felix nach der Freischaltung.'],
      links: [L('Meine Aufgaben', '/meine-todos'), L('Kunden', '/clients'), L('Hilfe', '/hilfe')],
    },
  },
  {
    slug: 'meine-aufgaben', typ: 'sop', titel: 'Meine Aufgaben abarbeiten', modul: 'Grundlagen', positionen: ['grundlagen'], status: 'freigegeben', video_key: 'aufgaben_ablauf', prioritaet: 1, reihenfolge: 2,
    zusammenfassung: 'Aufgaben aus allen Quellen an einem Ort: Kunden-Schritte, Ads, Projekte, interne Aufgaben.',
    abschnitte: {
      zweck: 'Nichts geht verloren, jede Aufgabe hat eine Frist und einen Verantwortlichen.',
      ausloeser: 'Täglich, morgens zuerst.',
      automatisch: ['Kunden-Schritte erscheinen bei deiner Funktion, sobald die Phase des Kunden startet.', 'Viele Schritte hakt die Cloud selbst ab (z. B. Kick-off gebucht, WhatsApp verbunden, Ads freigegeben).', 'Vom Kunden erledigte Schritte landen bei dir unter „zur Prüfung“.'],
      schritte: ['Filter „überfällig“ zuerst abarbeiten.', 'Karte auf „In Arbeit“ ziehen, wenn du anfängst.', 'Bei Kunden-Schritten „zur Prüfung“: Ergebnis ansehen, dann erledigt oder zurück an den Kunden mit Kommentar.', '„Nicht nötig“ nur mit Begründung.'],
      fehler: ['Aufgaben nur im Kopf abhaken – die Cloud weiß dann nicht, dass es weitergeht.', 'Überfällige Aufgaben liegen lassen statt kommentieren, warum es hängt.'],
      links: [L('Meine Aufgaben', '/meine-todos')],
    },
  },
  {
    slug: 'kunden-ablauf', typ: 'sop', titel: 'Kunden-Ablauf und Automatik-Schalter', modul: 'Grundlagen', positionen: ['grundlagen'], status: 'freigegeben', video_key: 'aufgaben_ablauf', prioritaet: 2, reihenfolge: 3,
    zusammenfassung: 'Phasen Zahlung → Onboarding → Setup → Continuity → Offboarding je Kunde.',
    abschnitte: {
      zweck: 'Auf einen Blick sehen, wo ein Kunde steht und was als Nächstes fehlt.',
      automatisch: ['Sind alle Schritte einer Phase erledigt, rutscht der Kunde selbst in die nächste Phase.', 'Bei neuen Kunden (Automatik an) laufen Vertrag, Zahlungserkennung, Setup, Meta-Prüfung, Funnel-Bau, Umfragen und Garantie-Ampel automatisch.', 'Bestandskunden haben die Automatik aus – dort läuft alles wie bisher.'],
      schritte: ['Kunde öffnen → Ablauf.', 'Offene Schritte der aktuellen Phase prüfen, Kommentare lesen.', 'Automatik-Karten (Vertrag, Meta, Funnel) zeigen den Stand der Automatik.', 'Nur Admins schalten die Automatik pro Kunde an oder aus.'],
      links: [L('Kunden', '/clients')],
    },
  },
  {
    slug: 'ki-assistent', typ: 'sop', titel: 'KI-Assistent und Akademie-Bot nutzen', modul: 'Grundlagen', positionen: ['grundlagen'], status: 'freigegeben', prioritaet: 3, reihenfolge: 4,
    zusammenfassung: 'Der Assistent kennt deine Aufgaben und Kunden, der Akademie-Bot dein Wissen aus der Akademie.',
    abschnitte: {
      automatisch: ['Der Assistent liest nur, was du sehen darfst (Rolle und Funktion).', 'Der Akademie-Bot antwortet nur aus freigegebenen Artikeln, die für dich freigeschaltet sind, und nennt die Quelle.', 'Findet der Bot nichts, sagt er das und meldet die Frage als Wissenslücke an Felix.'],
      schritte: ['Frage konkret stellen („Wie prüfe ich den Pixel im Funnel?“).', 'Quelle anklicken und im Zweifel die SOP lesen.', 'Daumen hoch/runter geben – so wird der Bot besser.'],
    },
  },

  // Abschluss & Zahlung
  {
    slug: 'after-close', typ: 'sop', titel: 'After-Close-Formular nach „Gewonnen“', modul: 'Abschluss & Zahlung', positionen: ['csm', 'closing', 'fuehrung'], step_keys: ['z_vertrag'], status: 'freigegeben', video_key: 'after_close', prioritaet: 1, reihenfolge: 10,
    zusammenfassung: 'Der eine Klick nach dem Abschluss: Kunde anlegen, Vertragslink an den Kunden.',
    abschnitte: {
      zweck: 'Alles, was nach dem Abschluss passiert, startet mit diesem Formular.',
      ausloeser: 'Opportunity in Close auf „Gewonnen“.',
      automatisch: ['Kunde, Abrechnungspläne und Ablauf werden angelegt, Automatik ist an.', 'Willkommens-Mail mit Vertragslink geht an den Kunden (Häkchen im Formular).', 'Doppelt absenden legt nichts doppelt an.', 'Garantieziel (Anzahl Starter) wird gespeichert.'],
      schritte: ['Admin → After-Close öffnen.', 'Firma, Ansprechpartner, Rechnungsmail, Paket, Setup- und Monatspreis, Laufzeit, Start und Garantieziel eintragen.', 'Vorschau der ersten Rechnung prüfen.', 'Absenden und Vertragslink auf der Erfolgsseite kontrollieren.'],
      qualitaet: ['Preise und Laufzeit stimmen mit dem Angebot überein.', 'Rechnungsmail ist die richtige Adresse (nicht die private).'],
      fehler: ['Falsches Paket → falsche Schritte im Ablauf (z. B. kein Meta-Teil).', 'Garantieziel leer → keine Garantie-Ampel.'],
      links: [L('After-Close', '/admin/after-close')],
    },
  },
  {
    slug: 'vertrag-bestaetigung', typ: 'sop', titel: 'Vertragsbestätigung in der Cloud', modul: 'Abschluss & Zahlung', positionen: ['csm', 'fuehrung'], step_keys: ['z_vertrag'], status: 'freigegeben', prioritaet: 2, reihenfolge: 11,
    zusammenfassung: 'Der Kunde bestätigt den Vertrag per Link – mit Name, Zeitstempel und PDF.',
    abschnitte: {
      automatisch: ['Kunde sieht Eckdaten und AGB, setzt Häkchen und Namen.', 'Name, Zeit, IP und ein Fingerabdruck der Vertragsdaten werden gespeichert.', 'PDF geht an Kunde und intern, Schritt „Vertrag“ hakt sich ab.', 'Danach entsteht die Aufgabe „Setup-Rechnung“ für die Buchhaltung.'],
      schritte: ['Bestätigt der Kunde nicht innerhalb von 2 Tagen: anrufen und Link erneut schicken (Erfolgsseite oder Ablauf-Karte).'],
      links: [L('Kunden', '/clients')],
    },
  },
  {
    slug: 'setup-rechnung', typ: 'sop', titel: 'Setup-Rechnung schreiben und Zahlung erkennen', modul: 'Abschluss & Zahlung', positionen: ['backoffice', 'fuehrung'], step_keys: ['z_rechnung_setup', 'z_zahlung_setup'], status: 'freigegeben', video_key: 'lexware_rechnung', prioritaet: 1, reihenfolge: 12,
    zusammenfassung: 'Rechnung schreibst du in Lexware, die Zahlung erkennt die Cloud selbst.',
    abschnitte: {
      ausloeser: 'Aufgabe „Erste Rechnung geschrieben“ nach Vertragsbestätigung.',
      automatisch: ['Die Cloud sucht alle 15 Minuten in Lexware die Rechnung an diesen Kunden (ab Tag der Bestätigung).', 'Steht sie auf bezahlt, hakt die Cloud Rechnung und Zahlung ab, startet das Onboarding und schickt dem Kunden „Zahlung eingegangen“.'],
      schritte: ['Rechnung in Lexware an den Kontakt des Kunden schreiben (Betrag steht in der Aufgabe).', 'Rechnung aus Lexware an den Kunden senden.', 'Findet die Cloud die Rechnung nicht: im Kunden-Ablauf „Lexware-Rechnungsnummer verknüpfen“.'],
      fehler: ['Rechnung an einen anderen Lexware-Kontakt mit ähnlichem Namen.', 'Rechnungsdatum vor der Vertragsbestätigung – wird nicht automatisch gefunden.'],
      links: [L('Buchhaltung', '/buchhaltung')],
    },
  },

  // Onboarding
  {
    slug: 'kickoff', typ: 'sop', titel: 'Kick-off-Meeting vorbereiten und durchführen', modul: 'Onboarding', positionen: ['csm'], step_keys: ['o_kickoff_gebucht', 'o_kickoff', 'o_transkript'], status: 'freigegeben', video_key: 'kickoff_call', prioritaet: 1, reihenfolge: 20,
    zusammenfassung: 'Erster gemeinsamer Termin: Erwartungen, Zugänge, Inhalte.',
    abschnitte: {
      automatisch: ['„Kick-off gebucht“ hakt sich ab, sobald der Kunde den Termin bucht.', 'Fireflies zeichnet auf; das Transkript-Signal hakt „Transkript hochgeladen“ ab.'],
      schritte: ['Vorher Close-Notizen und Gesprächsprotokoll des Abschlusses lesen.', 'Call nach Skript „Onboarding-Call“ führen.', 'Zugänge möglichst live im Call freigeben lassen.', 'Danach „Kick-off durchgeführt“ abhaken und Besonderheiten kommentieren.'],
      links: [L('Kalender', '/kalender')],
    },
  },
  {
    slug: 'onboarding-kunde', typ: 'sop', titel: 'Kunden-Onboarding begleiten (Login, Formular, Bilder)', modul: 'Onboarding', positionen: ['csm', 'media_buyer'], step_keys: ['o_cloud_login', 'o_inhaltsfunnel', 'o_bilder', 'o_whatsapp'], status: 'freigegeben', prioritaet: 2, reihenfolge: 21,
    zusammenfassung: 'Was der Kunde selbst erledigt und wann du nachhakst.',
    abschnitte: {
      automatisch: ['Login, Onboarding-Formular und WhatsApp-Verbindung hakt die Cloud selbst ab.', 'Erinnerungen an offene Kunden-Aufgaben gehen gestuft raus (nicht täglich).', 'Nach dem Formular baut sich das Setup bei Automatik-Kunden selbst (siehe „Setup automatisch prüfen“).'],
      schritte: ['Bilder & Branding prüfen (zur Prüfung): Logo, Farben, Team- und Arbeitsfotos brauchbar?', 'Hängt ein Kunde über 3 Tage: anrufen statt nur schreiben.'],
    },
  },
  {
    slug: 'meta-zugaenge', typ: 'sop', titel: 'Meta-Zugänge prüfen und Systemnutzer zuweisen', modul: 'Onboarding', positionen: ['media_buyer'], step_keys: ['o_meta_seite', 'o_meta_instagram', 'o_meta_werbekonto', 'o_meta_pixel', 'o_meta_domain', 'o_meta_zahlung', 'o_zugaenge_geprueft', 'o_systemnutzer'], status: 'freigegeben', video_key: 'meta_zugaenge', prioritaet: 1, reihenfolge: 22,
    zusammenfassung: 'Seite, Instagram, Werbekonto, Pixel, Domain, Zahlungsmethode – geprüft per Meta-API.',
    abschnitte: {
      automatisch: ['Bei Automatik-Kunden prüft die Cloud stündlich per Meta-API, was freigegeben ist, und hakt fertige Schritte ab.', 'Fehlt etwas, sieht der Kunde einen konkreten Hinweis unter „Deine Aufgaben“.', 'Ohne eingetragene Werbekonto-ID kann nichts geprüft werden.'],
      schritte: ['Partner-Anfrage im Business Manager annehmen.', 'Systemnutzer dem Werbekonto zuweisen und Werbekonto-ID beim Kunden eintragen.', 'Meta-Karte → „Zugänge prüfen“ und Ergebnis lesen.', '„unbekannt“ = von Hand prüfen und abhaken.'],
      fehler: ['Werbekonto-ID mit „act_“ eingetragen – geht inzwischen, aber besser nur die Zahl.', 'Zahlungsmethode fehlt → Kampagne kann nicht laufen.'],
      links: [L('Kunden', '/clients')],
    },
  },
  {
    slug: 'indeed-zugang', typ: 'sop', titel: 'Indeed-Zugang und Bewerber-Weiterleitung', modul: 'Onboarding', positionen: ['media_buyer'], step_keys: ['o_indeed', 's_indeed_anzeige'], status: 'freigegeben', video_key: 'indeed', prioritaet: 2, reihenfolge: 23,
    zusammenfassung: 'Admin-Zugang, Anzeige und Weiterleitung an die Cloud-Adresse.',
    abschnitte: {
      automatisch: ['Der KI-Generator schreibt die Indeed-Anzeige.', 'Weitergeleitete Indeed-Mails legen Bewerber in der Cloud an; Lebensläufe als Anhang liest die KI aus.'],
      schritte: ['Admin-Zugang des Kunden prüfen, Zahlungsmethode hinterlegt?', 'Anzeige aus dem Generator im Kunden-Konto einstellen.', 'Weiterleitung bewerber+<Kunden-ID>@zoepp-gruppe.de eintragen (Adresse unter Bewerber-Anbindung).'],
      fehler: ['Indeed-Benachrichtigungen enthalten meist keine Telefonnummer und keinen Lebenslauf – darauf nicht verlassen.'],
      links: [L('Bewerber-Anbindung', '/admin/anbindung')],
    },
  },

  // Setup
  {
    slug: 'auto-setup', typ: 'sop', titel: 'Automatisches Setup nach dem Onboarding prüfen', modul: 'Setup', positionen: ['csm', 'media_buyer'], status: 'freigegeben', prioritaet: 2, reihenfolge: 30,
    zusammenfassung: 'Bei Automatik-Kunden legt die Cloud Stelle, Bot, Terminzeiten und KI-Inhalte selbst an.',
    abschnitte: {
      automatisch: ['Stelle aus dem Briefing, Vertriebs-Bot (du/Sie), Termine Mo–Fr 9–17 Uhr, KI-Generator.', 'Meldung „Setup automatisch erstellt – bitte prüfen“ mit Hinweis, was im Briefing fehlte.'],
      schritte: ['Stelle: Titel, Region, Verdienst plausibel?', 'Bot: Ansprache und Fragen passen zum Kunden?', 'Terminzeiten an den echten Kalender des Kunden anpassen.', 'Fehlendes aus dem Briefing beim Kunden nachfragen.'],
    },
  },
  {
    slug: 'ads-werkstatt', typ: 'sop', titel: 'Ad-Ideen, Grafiken und KI-Bilder', modul: 'Setup', positionen: ['media_buyer', 'content'], step_keys: ['s_ideen', 's_grafiken', 's_ads_vorbereitet'], status: 'freigegeben', video_key: 'ads_werkstatt', prioritaet: 1, reihenfolge: 31,
    zusammenfassung: 'Generator schreibt Konzepte, KI erzeugt Bildvarianten, du wählst und verbesserst.',
    abschnitte: {
      automatisch: ['Ad-Ideen, Video-Skripte, Funnel-Texte und Indeed-Anzeige erzeugt der Generator.', 'Für Grafik-Ads entstehen je 3 KI-Bilder (2× quadratisch, 1× hochkant); höchstens 30 pro Kunde und Tag.', 'Die KI-Prüfung bewertet jede Ad; grün/gelb geht in die Kunden-Freigabe.', '„Grafiken gebaut“ hakt sich ab, sobald jede Grafik-Ad ein Bild hat.'],
      schritte: ['Ads-Board öffnen, Konzepte lesen, schwache verwerfen.', 'Beste Bildvariante wählen oder eigene Grafik hochladen.', 'Text der KI-Prüfung lesen und rote Punkte beheben.', 'Ad an den Kunden zur Freigabe geben.'],
      qualitaet: ['Kein Text im Bild, keine Geld- oder Luxusmotive.', 'Headline und Bild passen zur Stelle und Region.'],
      links: [L('Ads', '/ads')],
    },
  },
  {
    slug: 'freigabe-kunde', typ: 'sop', titel: 'Freigabe der Ads durch den Kunden', modul: 'Setup', positionen: ['media_buyer', 'csm'], step_keys: ['s_freigabe'], status: 'freigegeben', prioritaet: 3, reihenfolge: 32,
    zusammenfassung: 'Der Kunde gibt Ads und Texte im Portal frei oder fordert Änderungen.',
    abschnitte: {
      automatisch: ['Letzte Freigabe → Schritt hakt sich ab.', 'Bei Automatik-Kunden startet danach der Funnel-Bau, und die Meta-Kampagne wird pausiert angelegt.'],
      schritte: ['Änderungswünsche des Kunden zeitnah umsetzen und erneut freigeben lassen.'],
    },
  },
  {
    slug: 'funnel', typ: 'sop', titel: 'Funnel bauen und prüfen (Pixel & Webhook)', modul: 'Setup', positionen: ['media_buyer'], step_keys: ['s_funnel', 's_funnel_tracking'], status: 'freigegeben', video_key: 'funnel_pruefen', prioritaet: 1, reihenfolge: 33,
    zusammenfassung: 'Die Cloud kopiert die Vorlage in Perspective und setzt die Texte ein – Pixel und Webhook prüfst du.',
    abschnitte: {
      automatisch: ['Funnel-Bau: Vorlage duplizieren, freigegebene Texte einsetzen, veröffentlichen, URL speichern (Perspective muss verbunden sein).', 'Danach entsteht die Aufgabe „Funnel prüfen: Pixel & Webhook“.'],
      schritte: ['Pixel des Kunden im Funnel eintragen.', 'Webhook prüfen: https://cloud.zoeppmedia.de/api/webhooks/perspective (bei Vorlagen-Kopien ohne ?agency=).', 'Eigene Domain verbinden, falls gewünscht.', 'Test-Lead durchspielen.'],
      fehler: ['Vorlage mit ?agency= im Webhook → Leads landen beim falschen Kunden.', 'Texte weichen leicht ab, weil die KI sie einsetzt – kurz gegenlesen.'],
      links: [L('Funnels', '/funnels'), L('Anbindung', '/admin/anbindung')],
    },
  },
  {
    slug: 'test-lead', typ: 'sop', titel: 'Test-Lead durchspielen', modul: 'Setup', positionen: ['media_buyer'], step_keys: ['s_testlead'], status: 'freigegeben', prioritaet: 3, reihenfolge: 34,
    zusammenfassung: 'Ein Klick prüft Eingang → Cloud → WhatsApp.',
    abschnitte: {
      automatisch: ['„Test-Lead durchspielen“ prüft die Kette und hakt den Schritt bei Erfolg selbst ab.'],
      schritte: ['Kunde öffnen → „Test-Lead durchspielen“.', 'Bei Fehler: Meldung lesen (Webhook, WhatsApp, Stelle) und Ursache beheben.'],
    },
  },
  {
    slug: 'meta-kampagne', typ: 'sop', titel: 'Meta-Kampagne prüfen und starten', modul: 'Setup', positionen: ['media_buyer'], step_keys: ['s_werbemanager', 's_launch'], status: 'freigegeben', video_key: 'meta_kampagne', prioritaet: 1, reihenfolge: 35,
    zusammenfassung: 'Die Cloud legt die Kampagne pausiert an – Geld fließt erst nach deinem Klick.',
    abschnitte: {
      automatisch: ['Sind Zugänge geprüft, Ads freigegeben, Funnel und Budget da, legt die Cloud Kampagne, Anzeigengruppe und Anzeigen pausiert an (Sonderkategorie Beschäftigung).', 'Autostart nur, wenn beim Kunden eingeschaltet und Test-Lead erledigt.'],
      schritte: ['Kampagne im Werbemanager ansehen: Ziel, Region, Budget, Anzeigen.', 'Meta-Karte → „Kampagne starten“.', 'Kunde über den Start informieren, Starttermin abhaken.'],
      fehler: ['Meta lehnt Anzeigen ab → Grund lesen, Ad anpassen, neu einreichen.', 'Dateien in Google Drive/Dropbox kann Meta nicht laden – hochladen statt verlinken.'],
    },
  },
  {
    slug: 'starttermin', typ: 'sop', titel: 'Starttermin und Innendienst einteilen', modul: 'Setup', positionen: ['csm', 'innendienst'], step_keys: ['s_starttermin', 's_innendienst'], status: 'freigegeben', prioritaet: 3, reihenfolge: 36,
    zusammenfassung: 'Start mit dem Kunden abstimmen und, falls gebucht, Innendienst zuteilen.',
    abschnitte: {
      schritte: ['Starttermin mit dem Kunden vereinbaren und im Schritt notieren.', 'Bei Innendienst-Paket: zuständige Person im Team festlegen.'],
    },
  },

  // Laufende Betreuung
  {
    slug: 'continuity-check', typ: 'sop', titel: 'Anzeigen + Tracking prüfen (Tag 7 bis 75)', modul: 'Laufende Betreuung', positionen: ['media_buyer'], step_keys: ['c_check_7', 'c_check_14', 'c_check_30', 'c_check_45', 'c_check_60', 'c_check_75'], status: 'freigegeben', video_key: 'continuity_check', prioritaet: 2, reihenfolge: 40,
    zusammenfassung: 'Regelmäßiger Blick auf Kampagne und Tracking-Kette.',
    abschnitte: {
      automatisch: ['Meta-Zahlen synchronisiert die Cloud täglich.', 'Tag-7- und Tag-14-Report geht bei Automatik-Kunden automatisch raus.'],
      schritte: ['Leads, Kosten pro Lead, Bewerber und Termine ansehen.', 'Tracking-Kette prüfen: Funnel → Cloud → WhatsApp.', 'Ergebnis und Maßnahme im Schritt kommentieren.'],
      links: [L('Kunden-Ergebnisse', '/ergebnisse')],
    },
  },
  {
    slug: 'garantie-umfragen', typ: 'sop', titel: 'Garantie-Ampel, Umfragen und Folgeaufgaben', modul: 'Laufende Betreuung', positionen: ['csm'], status: 'freigegeben', video_key: 'garantie_verlaengerung', prioritaet: 2, reihenfolge: 41,
    zusammenfassung: 'Die Cloud misst Garantie und Zufriedenheit und meldet sich, wenn du handeln musst.',
    abschnitte: {
      automatisch: ['Garantie-Ampel täglich aus echten Einstellungen ab Kampagnenstart; bei Gelb Meldung, bei Rot dringende Aufgabe an den Betreuer.', 'Umfragen per Link ohne Login (Tag 0, 7, alle 14 Tage, quartalsweise).', 'Schlechte Note → „Kunde anrufen“, Weiterempfehlung 9–10 → „Bewertung anfragen“, mehr Bewerber/Budget → Upsell-Aufgabe.'],
      schritte: ['Rot/Gelb: Ursachen klären (Leads, Erreichbarkeit, Kunde ruft nicht an) und Plan mit dem Kunden festhalten.', 'Folgeaufgaben aus Umfragen am selben Tag erledigen.'],
    },
  },
  {
    slug: 'testimonial-verlaengerung', typ: 'sop', titel: 'Testimonial, Tag-90-Check und Verlängerung', modul: 'Laufende Betreuung', positionen: ['csm', 'closing'], step_keys: ['c_testimonial_termin', 'c_testimonial', 'c_check_90'], status: 'freigegeben', video_key: 'garantie_verlaengerung', prioritaet: 2, reihenfolge: 42,
    zusammenfassung: 'Ergebnisse sichern und rechtzeitig über die Fortsetzung sprechen.',
    abschnitte: {
      automatisch: ['Testimonial-Termin hakt sich bei Buchung ab.', 'Bei Automatik-Kunden 30 und 14 Tage vor Laufzeitende Aufgabe „Verlängerung/Upsell-Gespräch“ mit Kennzahlen.'],
      schritte: ['Testimonial aufnehmen und ablegen.', 'Tag 90: Upsell/Verlängerung ansprechen, Kennzahlen aus der Aufgabe nutzen.'],
    },
  },

  // Recruiting-Cloud & Innendienst
  {
    slug: 'innendienst', typ: 'sop', titel: 'Innendienst: in Kunden-Clouds arbeiten', modul: 'Recruiting-Cloud & Innendienst', positionen: ['innendienst'], status: 'freigegeben', video_key: 'innendienst', prioritaet: 1, reihenfolge: 50,
    zusammenfassung: 'Mit einem Klick in die Cloud eines Kunden und Bewerber bearbeiten.',
    abschnitte: {
      automatisch: ['Der Bot schreibt neue Bewerber an, stellt Fragen und bietet Termine an.', 'Termine erinnern sich selbst (24 h/2 h), außerhalb der Ruhezeit.'],
      schritte: ['Innendienst-Übersicht → Kunde → „Kunden-Login“.', 'Neue Bewerber: Pipeline-Status setzen, Notiz schreiben.', 'Nicht erreicht → Rückruf planen; erreicht → Termin anbieten.', 'Kunden-Cloud über den Hinweis oben wieder verlassen.'],
      links: [L('Innendienst', '/innendienst')],
    },
  },
  {
    slug: 'dialer', typ: 'sop', titel: 'Dialer, Kadenz und Rückrufe', modul: 'Recruiting-Cloud & Innendienst', positionen: ['innendienst', 'setting'], status: 'freigegeben', video_key: 'dialer', prioritaet: 2, reihenfolge: 51,
    zusammenfassung: 'Anrufen in der richtigen Reihenfolge, nichts vergessen.',
    abschnitte: {
      automatisch: ['Die Kadenz legt Anruf-Aufgaben in festen Zeitfenstern an (bei Automatik-Kunden alle 15 Minuten).', 'Fällige Rückrufe erscheinen in der Warteschlange.'],
      schritte: ['Dialer öffnen und von oben nach unten abarbeiten.', 'Jeden Anruf mit Ergebnis protokollieren.', '„Erneut anrufen“ immer mit Zeitpunkt.'],
      links: [L('Dialer', '/dialer')],
    },
  },
  {
    slug: 'whatsapp-inbox', typ: 'sop', titel: 'WhatsApp-Inbox (Kunden-Clouds und Sales)', modul: 'Recruiting-Cloud & Innendienst', positionen: ['innendienst', 'setting', 'csm'], status: 'freigegeben', video_key: 'whatsapp_inbox', prioritaet: 2, reihenfolge: 52,
    zusammenfassung: 'Chats wie in WhatsApp, Leads und Kunden getrennt.',
    abschnitte: {
      automatisch: ['Unbekannte Nummern werden automatisch Kontakte.', 'In der Sales-Inbox erkennt die Cloud Kunden über Nummern/E-Mails aller Kunden-Nutzer und Close.', 'Außerhalb des 24-h-Fensters geht nur eine freigegebene Vorlage.'],
      schritte: ['Tab Leads oder Kunden wählen.', 'Falsch zugeordnet? In der Seitenleiste „Kunde oder Lead“ setzen – das überschreibt die Automatik nicht.', 'Übernimmst du ein Gespräch, schreibt der Bot dort nicht weiter dazwischen.'],
      links: [L('Sales-WhatsApp', '/api/admin/sales-inbox')],
    },
  },
  {
    slug: 'termine', typ: 'sop', titel: 'Termine und Buchungslinks', modul: 'Recruiting-Cloud & Innendienst', positionen: ['innendienst'], status: 'freigegeben', prioritaet: 3, reihenfolge: 53,
    zusammenfassung: 'Bewerber buchen über Link nur angebotene, freie Zeiten.',
    abschnitte: {
      automatisch: ['Buchungslinks prüfen Status und freie Slots; Vergangenheit ist nicht buchbar.', 'Beim Verschieben wird erst neu gebucht, dann storniert – kein Termin geht verloren.'],
      schritte: ['Terminzeiten je Stelle unter Jobs → Verfügbarkeit pflegen (5–480 Minuten Dauer).'],
    },
  },

  // Vertrieb
  {
    slug: 'close-pflege', typ: 'sop', titel: 'Close-Pflege und Gesprächsprotokolle', modul: 'Vertrieb', positionen: ['setting', 'closing', 'vertriebsleitung'], status: 'freigegeben', video_key: 'close_pflege', prioritaet: 1, reihenfolge: 60,
    zusammenfassung: 'Sauberer Status in Close = richtige Zahlen und automatische Nachrichten.',
    abschnitte: {
      automatisch: ['KI wertet Gespräche aus Fireflies aus und schreibt eine Kurznotiz an den Lead.', 'Neuer Lead → nach 10 Minuten Prüfung, ob ein Termin gebucht wurde.', 'Status „Setting - No Show“ → WhatsApp an den Lead.', 'Status „… - Follow Up“ + Rhythmus-Feld → WhatsApp-Follow-up-Kette.', 'Leadquelle wird aus UTM gesetzt.'],
      schritte: ['Nach jedem Gespräch Status setzen – das zählt fürs Controlling und für die Person.', 'Follow-up-Rhythmus-Feld ausfüllen.', 'Nächsten Schritt als Close-Aufgabe mit Datum anlegen.'],
      fehler: ['Status vergessen → Setting zählt bei der falschen Person oder gar nicht.'],
    },
  },
  {
    slug: 'sales-controlling', typ: 'sop', titel: 'Sales-Controlling und Team-Auslastung', modul: 'Vertrieb', positionen: ['vertriebsleitung', 'fuehrung'], status: 'freigegeben', video_key: 'sales_controlling', prioritaet: 3, reihenfolge: 61,
    zusammenfassung: `Ampeln: Setter ${S.settingMin}/${S.settingOptimal}/${S.settingMax} Settings/Tag, Closer ${S.closingMin}–${S.closingOptimal} Closings/Tag.`,
    abschnitte: {
      automatisch: ['Alle Zahlen kommen live aus Close (Anwahlen, Statuswechsel, Aufgaben) und Meta.', `Kapazitätsblick: „neuer Setter nötig“ ab Ø über ${S.settingVoll}, „neuer Closer nötig“ ab Ø über ${S.closingOptimal} über 10 Werktage.`],
      schritte: ['Zeitraum wählen, Tab „Team & Auslastung“.', 'Personen unter Mindestwert ansprechen (Setting-Follow-ups mindestens ' + S.followupsMin + '/Tag).', 'No-Show-Rückholung je Person besprechen.'],
      links: [L('Sales-Controlling', '/admin/vertrieb')],
    },
  },

  // Finanzen
  {
    slug: 'umsatz-analyse', typ: 'sop', titel: 'Umsatz-Analyse lesen', modul: 'Finanzen', positionen: ['fuehrung', 'backoffice'], status: 'freigegeben', prioritaet: 4, reihenfolge: 70,
    zusammenfassung: 'Woher der Umsatz kommt: Neukunde, Bestand, Upsell, Quelle, Paket.',
    abschnitte: {
      automatisch: ['Rechnungen aus Lexware, Abschlüsse aus Close, 10 Minuten zwischengespeichert.'],
      schritte: ['Zeitraum wählen, Neukunden-/Bestandsanteil und MRR ansehen.', 'Abgleich „gewonnen, aber keine Rechnung“ abarbeiten.'],
      links: [L('Umsatz-Analyse', '/admin/umsatz')],
    },
  },
  {
    slug: 'mahnwesen', typ: 'sop', titel: 'Mahnwesen und offene Rechnungen', modul: 'Finanzen', positionen: ['backoffice'], status: 'entwurf', prioritaet: 3, reihenfolge: 71,
    zusammenfassung: 'Offene Rechnungen nachhalten – Ablauf noch vom Inhaber zu bestätigen.',
    abschnitte: {
      automatisch: ['Für überfällige Rechnungen legt die Cloud Aufgaben an (Zahlungserinnerung, Mahnung, Eskalation); Mahn-Mails nur bei eingeschaltetem Mahnwesen.'],
      schritte: [ERGAENZT('Ab wie vielen Tagen erinnern, mahnen, eskalieren? Wer ruft an, was wird gesagt? Wann Inkasso/Anwalt?')],
      links: [L('Rechnungen & Mahnwesen', '/buchhaltung')],
    },
  },

  // Offboarding
  {
    slug: 'offboarding', typ: 'sop', titel: 'Offboarding sauber abschließen', modul: 'Offboarding', positionen: ['csm', 'media_buyer'], step_keys: ['off_kuendigung', 'off_kampagnen', 'off_zugaenge', 'off_report', 'off_testimonial', 'off_cloud'], status: 'freigegeben', prioritaet: 3, reihenfolge: 80,
    zusammenfassung: 'Kündigung erfassen, Kampagnen pausieren, Zugänge übergeben, Abschlussreport, Cloud deaktivieren.',
    abschnitte: {
      ausloeser: 'Offboarding wird nur manuell im Kunden-Ablauf gestartet.',
      schritte: ['Kündigung mit Datum erfassen.', 'Kampagnen pausieren (Media Buyer).', 'Zugänge übergeben oder entfernen.', 'Abschlussreport schicken, Testimonial anfragen.', 'Cloud-Zugang deaktivieren.'],
    },
  },
];

/* ── Rollen (je Position) ───────────────────────────────────────────── */

const ROLLEN: ArtikelDef[] = [
  {
    slug: 'rolle-setting', typ: 'rolle', titel: 'Rolle: Setting', modul: 'Rollen', positionen: ['setting'], status: 'entwurf', reihenfolge: 1,
    zusammenfassung: 'Erstgespräche führen, Closing-Termine legen, Setting-Follow-ups.',
    inhalt: [
      '## Ziele (aus dem Sales-Controlling)',
      `- Gehaltene Settings pro Tag: unter ${S.settingMin} nicht ausgelastet, ${S.settingOptimal} optimal, ab ${S.settingVoll} fast voll, über ${S.settingMax} überlastet (Kapazitätsgrenze ${S.settingKapazitaet}).`,
      `- Setting-Follow-ups: mindestens ${S.followupsMin} pro Tag neben den Terminen.`,
      '- Wir arbeiten nur inbound – kein Ziel für reine Anwahlen.',
      '',
      '## Werkzeuge',
      '- Close (Status, Follow-up-Rhythmus, Aufgaben), Sales-WhatsApp, Kalender.',
      '',
      '## Tagesablauf',
      ERGAENZT('Wie sieht ein typischer Tag aus (Zeiten für Termine, Follow-up-Blöcke, Pausen)?'),
      '',
      '## Verantwortung & Übergaben',
      ERGAENZT('Wann ist ein Setting „gehalten“, wann wird an den Closer übergeben, was muss im Lead stehen?'),
    ].join('\n'),
  },
  {
    slug: 'rolle-closing', typ: 'rolle', titel: 'Rolle: Closing', modul: 'Rollen', positionen: ['closing'], status: 'entwurf', reihenfolge: 2,
    zusammenfassung: 'Abschlussgespräche, Angebote, CC2, Übergabe an After-Close.',
    inhalt: [
      '## Ziele',
      `- Gehaltene Closings pro Tag: mindestens ${S.closingMin}, optimal ${S.closingMin}–${S.closingOptimal}, ab ${S.closingUeberlastet} überlastet.`,
      '- Nach „Gewonnen“ sofort After-Close-Formular absenden (siehe SOP).',
      '',
      '## Tagesablauf',
      ERGAENZT('Termin-Takt, Vorbereitung je Call, Nachbereitung, Angebots-Follow-up.'),
      '',
      '## Angebote & Preise',
      ERGAENZT('Pakete, Preisspannen, Rabattregeln, wer darf was freigeben?'),
    ].join('\n'),
  },
  {
    slug: 'rolle-vertriebsleitung', typ: 'rolle', titel: 'Rolle: Vertriebsleitung', modul: 'Rollen', positionen: ['vertriebsleitung'], status: 'entwurf', reihenfolge: 3,
    zusammenfassung: 'Team steuern über Sales-Controlling, Auslastung und Close-Qualität.',
    inhalt: ['## Ziele', '- Auftragsvolumen-Ziel 300k (Sales-Controlling).', '- Auslastung der Setter/Closer im optimalen Bereich halten.', '', '## Wöchentliche Routine', ERGAENZT('Welche Meetings, welche Zahlen, wann wird nachgesteuert?')].join('\n'),
  },
  {
    slug: 'rolle-csm', typ: 'rolle', titel: 'Rolle: Kundenbetreuung', modul: 'Rollen', positionen: ['csm'], status: 'entwurf', reihenfolge: 4,
    zusammenfassung: 'Vom Vertrag bis zur Verlängerung: Kick-off, Begleitung, Garantie, Upsell.',
    inhalt: ['## Verantwortung', '- Vertrag/After-Close, Kick-off, Onboarding begleiten, Garantie-Ampel, Umfrage-Folgeaufgaben, Verlängerung, Offboarding.', '', '## Kontakt-Rhythmus', ERGAENZT('Wie oft meldest du dich bei Kunden, über welchen Kanal, mit welchen Inhalten?'), '', '## Eskalation', ERGAENZT('Ab wann eskalierst du an Felix?')].join('\n'),
  },
  {
    slug: 'rolle-innendienst', typ: 'rolle', titel: 'Rolle: Innendienst', modul: 'Rollen', positionen: ['innendienst'], status: 'entwurf', reihenfolge: 5,
    zusammenfassung: 'Bewerber in den Kunden-Clouds bearbeiten, anrufen, terminieren.',
    inhalt: ['## Werkzeuge', '- Innendienst-Übersicht, Kunden-Login, Dialer, WhatsApp-Inbox, Pipeline.', '', '## Ziele', ERGAENZT('Anrufe/Tag, Speed-to-Lead, Terminquote – welche Zahlen gelten?'), '', '## Gesprächsleitfaden Bewerber', ERGAENZT('Wie wird ein Bewerber angerufen und qualifiziert?')].join('\n'),
  },
  {
    slug: 'rolle-media-buyer', typ: 'rolle', titel: 'Rolle: Ads & Funnel', modul: 'Rollen', positionen: ['media_buyer'], status: 'entwurf', reihenfolge: 6,
    zusammenfassung: 'Grafiken, Copys, Ads, Funnel, Tracking, Meta und Indeed.',
    inhalt: ['## Verantwortung', '- Zugänge prüfen, Ads-Werkstatt, Funnel prüfen, Kampagne starten, Continuity-Checks, Offboarding der Kampagnen.', '', '## Qualitätsmaßstab', ERGAENZT('Was macht eine gute Ad bei uns aus? Beispiele guter/schlechter Ads?'), '', '## Benchmarks', ERGAENZT('Ziel-Kosten pro Lead/Bewerber je Branche, ab wann wird gegengesteuert?')].join('\n'),
  },
  {
    slug: 'rolle-content', typ: 'rolle', titel: 'Rolle: Content', modul: 'Rollen', positionen: ['content'], status: 'entwurf', reihenfolge: 7,
    zusammenfassung: 'Video-Skripte, Copys und Content.',
    inhalt: ['## Verantwortung', ERGAENZT('Welche Inhalte erstellt Content selbst, welche übernimmt die KI, wer gibt frei?')].join('\n'),
  },
  {
    slug: 'rolle-backoffice', typ: 'rolle', titel: 'Rolle: Buchhaltung', modul: 'Rollen', positionen: ['backoffice'], status: 'entwurf', reihenfolge: 8,
    zusammenfassung: 'Rechnungen in Lexware, Zahlungsabgleich über Qonto, Mahnwesen.',
    inhalt: ['## Verantwortung', '- Setup-Rechnung nach Vertragsbestätigung (Aufgabe kommt automatisch), monatliche Rechnungen, Mahnwesen.', '- Zahlungsabgleich läuft über die Lexware-Qonto-Verbindung.', '', '## Monatsabschluss', ERGAENZT('Wann werden Monatsrechnungen geschrieben, was wird geprüft, wer bekommt welche Auswertung?'), '', '## SEPA', ERGAENZT('Werden SEPA-Mandate genutzt? Wenn ja: Ablauf und Vorabankündigung.')].join('\n'),
  },
  {
    slug: 'rolle-ops', typ: 'rolle', titel: 'Rolle: Operations', modul: 'Rollen', positionen: ['ops'], status: 'entwurf', reihenfolge: 9,
    zusammenfassung: 'Abläufe und Systeme im Hintergrund.',
    inhalt: [ERGAENZT('Wofür ist Operations zuständig, welche Systeme betreut die Rolle?')].join('\n'),
  },
  {
    slug: 'rolle-fuehrung', typ: 'rolle', titel: 'Rolle: Führung', modul: 'Rollen', positionen: ['fuehrung'], status: 'entwurf', reihenfolge: 10,
    zusammenfassung: 'Freigaben, Kennzahlen, Akademie-Pflege.',
    inhalt: ['## Wiederkehrend', '- Akademie: Entwürfe freigeben, Wissenslücken schließen, Videos aufnehmen.', '- Zugriffe der Mitarbeiter pflegen.', '', ERGAENZT('Welche Entscheidungen trifft nur die Führung?')].join('\n'),
  },
];

/* ── Skripte (Gerüste – Inhalt liefert der Inhaber) ─────────────────── */

const SKRIPTE: ArtikelDef[] = [
  {
    slug: 'skript-setting', typ: 'skript', titel: 'Setting-Skript', modul: 'Skripte', positionen: ['setting'], status: 'entwurf', reihenfolge: 1,
    zusammenfassung: 'Leitfaden für das Erstgespräch.',
    inhalt: ['## Einstieg', ERGAENZT('Wie begrüßt du, wie holst du Erlaubnis für das Gespräch?'), '## Situation & Bedarf', ERGAENZT('Welche Fragen stellst du (Teamgröße, Bewerberlage, Ziele, Zeitrahmen)?'), '## Qualifizierung', ERGAENZT('Woran erkennst du einen passenden Lead? Ausschlusskriterien?'), '## Termin legen', ERGAENZT('Wie leitest du in den Closing-Termin über?'), '', 'Tipp: Lade gute Setting-Calls unter „Wissen einspeisen → Gesprächs-Transkript“ hoch, dann entwirft die KI das Skript aus echten Gesprächen.'].join('\n'),
  },
  {
    slug: 'skript-closing', typ: 'skript', titel: 'Closing-Skript', modul: 'Skripte', positionen: ['closing'], status: 'entwurf', reihenfolge: 2,
    zusammenfassung: 'Leitfaden für das Abschlussgespräch.',
    inhalt: ['## Rahmen setzen', ERGAENZT('Agenda, Zeit, Entscheider dabei?'), '## Analyse', ERGAENZT('Welche Fragen klären Ist-Situation und Schmerz?'), '## Lösung & Garantie', ERGAENZT('Wie präsentierst du das Angebot und die Garantie?'), '## Preis & Abschluss', ERGAENZT('Wie nennst du den Preis, wie fragst du nach dem Abschluss?')].join('\n'),
  },
  {
    slug: 'skript-onboarding-call', typ: 'skript', titel: 'Onboarding-Call-Skript (Kick-off)', modul: 'Skripte', positionen: ['csm'], status: 'entwurf', reihenfolge: 3,
    zusammenfassung: 'Leitfaden für den Kick-off mit neuen Kunden.',
    inhalt: ['## Ablauf', '- Erwartungen und Garantie klären', '- Zugänge live freigeben (Meta, Indeed, WhatsApp)', '- Inhalte: Stelle, Region, Verdienst, Bilder', '- Nächste Schritte und Termine', '', ERGAENZT('Konkrete Formulierungen, Reihenfolge, typische Rückfragen der Kunden.')].join('\n'),
  },
  {
    slug: 'skript-einwaende', typ: 'skript', titel: 'Einwandbehandlung', modul: 'Skripte', positionen: ['setting', 'closing'], status: 'entwurf', reihenfolge: 4,
    zusammenfassung: 'Häufige Einwände und Antworten.',
    inhalt: ['| Einwand | Antwort |', '|---|---|', '| „Zu teuer“ | Felix ergänzt |', '| „Keine Zeit“ | Felix ergänzt |', '| „Muss ich mir überlegen“ | Felix ergänzt |', '| „Haben schon eine Agentur“ | Felix ergänzt |'].join('\n'),
  },
];

/* ── FAQ (Gerüste) ──────────────────────────────────────────────────── */

const FAQ: ArtikelDef[] = [
  {
    slug: 'faq-indeed-lebenslauf', typ: 'faq', titel: 'Warum kommt bei Indeed kein Lebenslauf/keine Nummer an?', modul: 'FAQ', positionen: ['media_buyer', 'innendienst'], status: 'freigegeben', reihenfolge: 1,
    zusammenfassung: 'Indeed schickt in der Benachrichtigung meist nur Name und einen Link.',
    inhalt: 'Indeed-Benachrichtigungen enthalten in der Regel weder Telefonnummer noch Lebenslauf – die Daten liegen im Indeed-Konto des Kunden hinter dem Login. Ein Bot darf sich dort nicht einloggen (Sperr-Risiko für das Kundenkonto). Wege: Lebensläufe herunterladen und hochladen, oder die offizielle Indeed-Apply-Anbindung.',
  },
  {
    slug: 'faq-automatik', typ: 'faq', titel: 'Warum passiert bei einem Kunden nichts automatisch?', modul: 'FAQ', positionen: ['grundlagen'], status: 'freigegeben', reihenfolge: 2,
    zusammenfassung: 'Die neue Automatik läuft nur bei Kunden mit eingeschalteter Automatik.',
    inhalt: 'Die Fulfillment-Automatik (Vertrag, Zahlungserkennung, Setup, Meta, Funnel, Umfragen, Garantie) ist nur bei neuen Kunden aus dem After-Close an. Bestandskunden laufen wie bisher. Ein Admin kann sie im Kunden-Ablauf einschalten.',
  },
];

/** Alle Start-Inhalte – jedes Thema mit den vier Bausteinen (Checkliste + Review fest in den Abschnitten) */
export const START_ARTIKEL: ArtikelDef[] = [...SOPS, ...ROLLEN, ...SKRIPTE, ...FAQ, ...ARTIKEL_A_Z].map(mitBausteinen);
