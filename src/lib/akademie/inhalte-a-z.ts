/**
 * Akademie von A bis Z: Kultur, Arbeitsweise, Lernpfade je Position und Handwerk Marketing.
 * Allgemeingültige Best Practices sind ausformuliert. Firmenspezifisches (Preise, Tools, Zeiten,
 * Ziele ohne Codebeleg, Skript-Wortlaute) steht als „Felix ergänzt: …“ mit Leitfragen.
 * Alles hier startet als Entwurf und wird von Felix freigegeben.
 */

import type { ArtikelDef, VideoDef } from './inhalte';
import { STANDARD_SCHWELLEN as S } from '@/lib/sales-controlling/auslastung';

const L = (label: string, href: string) => ({ label, href });
const E = (frage: string) => `> **Felix ergänzt:** ${frage}`;
const md = (...zeilen: string[]) => zeilen.join('\n');

/* ── Videos ──────────────────────────────────────────────────────────── */

export const VIDEOS_A_Z: VideoDef[] = [
  // Mindset – kurz, persönlich, von Felix (Handy-Kamera reicht)
  { key: 'mindset_warum', titel: 'Warum es uns gibt – und was wir versprechen', session: '0 · Mindset & Kultur', session_reihenfolge: 1, laenge_min: 3, prioritaet: 1, drehbuch: ['Wer wir sind und für wen wir arbeiten (Vertriebsfirmen, die Leute brauchen)', 'Unser Versprechen: Garantie und was sie für jeden im Team bedeutet', 'Was ein guter Arbeitstag bei uns ist', 'Was ich von jedem erwarte – und was ihr von mir erwarten könnt'] },
  { key: 'mindset_ownership', titel: 'Ownership & Tempo', session: '0 · Mindset & Kultur', session_reihenfolge: 2, laenge_min: 2, prioritaet: 1, drehbuch: ['„Nicht meine Aufgabe“ gibt es nicht – Beispiel', 'Schnell reagieren schlägt perfekt reagieren (Speed-to-Lead)', 'Probleme melden mit Lösungsvorschlag'] },
  { key: 'mindset_fehler', titel: 'Fehlerkultur & Qualität', session: '0 · Mindset & Kultur', session_reihenfolge: 3, laenge_min: 2, prioritaet: 2, drehbuch: ['Fehler sofort sagen – warum das niemandem schadet', 'Checkliste und Review: wozu wir sie wirklich nutzen', 'Ein Beispiel, aus dem wir gelernt haben'] },
  { key: 'mindset_kunde', titel: 'Kundenfokus: Wie wir mit Kunden umgehen', session: '0 · Mindset & Kultur', session_reihenfolge: 4, laenge_min: 3, prioritaet: 1, drehbuch: ['Ton und Haltung gegenüber Kunden', 'Erwartungen managen statt Versprechen machen', 'Wann du an mich eskalierst'] },
  // Arbeitsweise
  { key: 'arbeitsplatz', titel: 'Mein Arbeitstag: Start, Fokus, Feierabend', session: 'A · Cloud-Grundlagen', session_reihenfolge: 3, laenge_min: 4, prioritaet: 2, sop_aufnahme: true, drehbuch: ['Tagesstart: Tools öffnen, Meine Aufgaben, Inbox', 'Fokusblöcke und Erreichbarkeit', 'Arbeitsplatz verlassen: sperren, Status, Übergaben', 'Feierabend-Check in der Cloud'] },
  // Innendienst
  { key: 'innendienst_anruf', titel: 'Innendienst: Bewerber anrufen von A bis Z', session: 'E · Recruiting-Cloud', session_reihenfolge: 4, laenge_min: 6, prioritaet: 1, sop_aufnahme: true, drehbuch: ['Vorbereitung im Bewerberprofil: Quelle, Antworten, WhatsApp-Verlauf', 'Anruf live: Begrüßung, Grund, Qualifizierung, Termin', 'Nicht erreicht: Ergebnis im Dialer, Kadenz übernimmt', 'Dokumentation und nächster Bewerber'] },
  // Setting / Closing
  { key: 'setting_tag', titel: 'Setting: Tagesablauf, Follow-ups & Übergabe an den Closer', session: 'F · Vertrieb', session_reihenfolge: 3, laenge_min: 5, prioritaet: 1, sop_aufnahme: true, drehbuch: ['Morgens: Termine und Follow-up-Liste in Close', `Mindestens ${S.followupsMin} Setting-Follow-ups neben den Terminen`, 'Setting führen und dokumentieren', 'Übergabe an den Closer: was in der Notiz stehen muss'] },
  { key: 'closing_ablauf', titel: 'Closing: Vorbereitung, Gespräch, Nachbereitung', session: 'F · Vertrieb', session_reihenfolge: 4, laenge_min: 5, prioritaet: 1, drehbuch: ['Vorbereitung: Setting-Notiz und KI-Gesprächsprotokoll lesen', 'Gesprächsrahmen und Entscheider', 'Nach dem Gespräch: Status, Angebot/CC2, After-Close bei Gewonnen'] },
  // Handwerk Marketing
  { key: 'creatives', titel: 'Creatives erstellen und prüfen', session: 'C · Setup-Werkstatt', session_reihenfolge: 5, laenge_min: 5, prioritaet: 1, sop_aufnahme: true, drehbuch: ['Briefing lesen, Zielgruppe und Hook festlegen', 'Formate 1:1, 4:5, 9:16 anlegen', 'KI-Bilder aus der Cloud nutzen und bewerten', 'Checkliste vor der Freigabe'] },
  { key: 'video_schnitt', titel: 'Videos schneiden: Hook, Untertitel, Export', session: 'C · Setup-Werkstatt', session_reihenfolge: 6, laenge_min: 6, prioritaet: 2, sop_aufnahme: true, drehbuch: ['Rohmaterial sichten, beste Aussage als Hook nach vorn', 'Schnitt-Tempo und Pausen raus', 'Untertitel und Formate', 'Export-Einstellungen, Benennung, Ablage'] },
  { key: 'skripte_schreiben', titel: 'Skripte und Ad-Texte schreiben und absegnen lassen', session: 'C · Setup-Werkstatt', session_reihenfolge: 7, laenge_min: 4, prioritaet: 2, sop_aufnahme: true, drehbuch: ['KI-Generator als Startpunkt', 'Hook, Problem, Lösung, Handlung – an einem Beispiel überarbeiten', 'Interne Freigabe und dann „Deine Freigaben“ beim Kunden'] },
  // Buchhaltung / Operations / Führung
  { key: 'ops_check', titel: 'Täglicher System-Check (Operations)', session: 'G · Buchhaltung', session_reihenfolge: 2, laenge_min: 3, prioritaet: 3, sop_aufnahme: true, drehbuch: ['Benachrichtigungen und Fehlermeldungen der Cloud', 'Hängende Automatik-Karten (Vertrag, Meta, Funnel)', 'Wohin du Probleme meldest'] },
];

/* ── Willkommen & Kultur ─────────────────────────────────────────────── */

const KULTUR: ArtikelDef[] = [
  {
    slug: 'willkommen', typ: 'wissen', titel: 'Willkommen bei Zoepp Media: Wer wir sind', modul: 'Willkommen & Kultur', positionen: ['grundlagen'], status: 'entwurf', video_key: 'mindset_warum', prioritaet: 1, reihenfolge: 1,
    zusammenfassung: 'Was wir verkaufen, für wen, und was die Garantie für deine Arbeit bedeutet.',
    inhalt: md(
      '## Was wir machen',
      'Wir gewinnen für unsere Kunden – Vertriebsfirmen und Direktvertriebe – neue Mitarbeiter und Vertriebspartner. Dafür schalten wir Anzeigen (Meta, Indeed), bauen Funnel, qualifizieren Bewerber per WhatsApp-Bot und Telefon und legen Termine direkt in den Kalender unserer Kunden.',
      '',
      '## Unser Versprechen',
      'Kunden kaufen bei uns ein Ergebnis mit Garantie (Anzahl Starter in einem Zeitraum). Jede Aufgabe im Team zahlt darauf ein: schnelle Anrufe, saubere Anzeigen, klare Kommunikation.',
      E('Wie erklärst du in zwei Sätzen, warum Kunden zu uns kommen? Welche Pakete gibt es, und was ist die Garantie genau?'),
      '',
      '## Wie das Team aufgebaut ist',
      '- Vertrieb: Setting, Closing, Vertriebsleitung',
      '- Fulfillment: Kundenbetreuung, Innendienst, Operations',
      '- Marketing: Ads & Funnel, Content',
      '- Verwaltung: Buchhaltung',
      E('Wer ist aktuell in welcher Rolle, wer ist Ansprechpartner für was?'),
    ),
    abschnitte: {
      checkliste: ['Artikel gelesen', 'Video „Warum es uns gibt“ angesehen', 'Ich kenne meine Ansprechpartner im Team', 'Ich kenne das Garantieversprechen und weiß, was es für meine Rolle bedeutet'],
      review: ['Ich kann unser Angebot in zwei Sätzen erklären', 'Ich weiß, welche Rolle in welchem Schritt des Kundenablaufs zuständig ist'],
    },
  },
  {
    slug: 'mindset', typ: 'wissen', titel: 'Unser Mindset: Ownership, Tempo, Qualität, Fehlerkultur, Kundenfokus', modul: 'Willkommen & Kultur', positionen: ['grundlagen'], status: 'entwurf', video_key: 'mindset_ownership', prioritaet: 1, reihenfolge: 2,
    zusammenfassung: 'Fünf Haltungen, an denen wir unsere Arbeit messen – mit Beispielen.',
    inhalt: md(
      '## Ownership',
      'Wenn du etwas siehst, das hakt, gehört es dir, bis es gelöst oder sauber übergeben ist. „Nicht meine Aufgabe“ ist keine Antwort – „Ich habe es an X übergeben, Stand: …“ schon.',
      '',
      '## Tempo',
      'Ein Bewerber, der in den ersten Minuten angerufen wird, ist um ein Vielfaches leichter erreichbar als am nächsten Tag. Darum: schnell reagieren, dann gründlich werden.',
      '',
      '## Qualität',
      'Jede Aufgabe hat eine Checkliste und eine Review-Checkliste. Sie sind kein Misstrauen, sondern dein Werkzeug, damit nichts durchrutscht.',
      '',
      '## Fehlerkultur',
      'Fehler passieren. Wichtig ist, dass du sie sofort meldest – mit dem, was passiert ist, und was du schon getan hast. Verschwiegene Fehler sind das einzige echte Problem.',
      '',
      '## Kundenfokus',
      'Unsere Kunden zahlen für Ergebnisse. Freundlich, klar, ehrlich – und nie etwas versprechen, das wir nicht sicher halten können.',
      '',
      E('Welche Werte sind dir persönlich am wichtigsten? Gibt es Beispiele aus dem Team, die das gut zeigen?'),
    ),
    abschnitte: {
      checkliste: ['Artikel gelesen', 'Mindset-Videos angesehen (Ownership & Tempo, Fehlerkultur, Kundenfokus)'],
      review: ['Ich habe diese Woche ein Problem mit Lösungsvorschlag gemeldet statt nur gemeldet', 'Ich habe einen eigenen Fehler offen angesprochen, falls einer passiert ist'],
    },
  },
];

/* ── Arbeitsweise & Regeln ───────────────────────────────────────────── */

const ARBEITSWEISE: ArtikelDef[] = [
  {
    slug: 'arbeitsplatz-tagesstart', typ: 'sop', titel: 'Am Arbeitsplatz: Tagesstart, Fokus und Erreichbarkeit', modul: 'Arbeitsweise & Regeln', positionen: ['grundlagen'], status: 'entwurf', video_key: 'arbeitsplatz', prioritaet: 1, reihenfolge: 10,
    zusammenfassung: 'So startest du in den Tag und arbeitest konzentriert, ohne erreichbar zu sein für alles gleichzeitig.',
    abschnitte: {
      zweck: 'Jeder startet gleich, nichts Dringendes bleibt liegen, und konzentrierte Arbeit ist möglich.',
      ausloeser: 'Jeden Arbeitstag zu Beginn und nach jeder längeren Pause.',
      automatisch: ['Meine Aufgaben zeigt dir überfällige und heute fällige Punkte zuerst.', 'Neue WhatsApp-Nachrichten und Leads erscheinen als Benachrichtigung in der Cloud.'],
      schritte: [
        'Rechner entsperren, Headset prüfen, Cloud öffnen (Meine Aufgaben) – plus die Tools deiner Rolle (Close, WhatsApp-Inbox, Werbemanager …).',
        'Überfällige Aufgaben zuerst ansehen: erledigen, terminieren oder mit Kommentar versehen.',
        'Benachrichtigungen und Inbox durchgehen; Dringendes sofort, Rest in Aufgaben überführen.',
        'Tagesplan festlegen: feste Termine eintragen, dazwischen Fokusblöcke von 60–90 Minuten.',
        'Während Fokusblöcken Benachrichtigungen bündeln (z. B. alle 30 Minuten prüfen) – Ausnahme: Rollen mit Speed-to-Lead (Innendienst, Setting) reagieren auf neue Leads sofort.',
        'Pausen bewusst nehmen und im Team-Kanal kurz Bescheid geben, wenn du länger als 15 Minuten weg bist.',
      ],
      checkliste: ['Tools meiner Rolle geöffnet', 'Überfällige Aufgaben geprüft', 'Inbox/Benachrichtigungen gesichtet', 'Tagesplan mit Fokusblöcken steht', 'Status im Team sichtbar (erreichbar/Fokus)'],
      review: ['Kein überfälliger Punkt ohne Kommentar', 'Neue Leads wurden in meiner Rolle innerhalb der Vorgabe bearbeitet', 'Ich hatte mindestens einen ungestörten Fokusblock'],
      fehler: ['Den Tag in der Inbox verlieren statt mit den Aufgaben zu starten.', 'Leads in Fokusblöcken liegen lassen (Innendienst/Setting).'],
      links: [L('Meine Aufgaben', '/meine-todos'), L('WhatsApp-Inbox', '/inbox')],
    },
    inhalt: md(E('Feste Arbeitszeiten, Kernzeit, Team-Kanal (Slack/WhatsApp-Gruppe?), Daily-Meeting – wann und wo?')),
  },
  {
    slug: 'arbeitsplatz-verlassen', typ: 'sop', titel: 'Arbeitsplatz verlassen und Feierabend-Check', modul: 'Arbeitsweise & Regeln', positionen: ['grundlagen'], status: 'entwurf', video_key: 'arbeitsplatz', prioritaet: 1, reihenfolge: 11,
    zusammenfassung: 'Sicher weg vom Platz – kurz oder zum Feierabend – ohne offene Enden.',
    abschnitte: {
      zweck: 'Kundendaten bleiben geschützt und kein Gespräch, Lead oder Termin bleibt unbemerkt liegen.',
      ausloeser: 'Jedes Mal, wenn du den Platz verlässt; ausführlich zum Feierabend.',
      schritte: [
        'Kurz weg: Bildschirm sperren (Windows: Win+L, Mac: Ctrl+Cmd+Q). Immer – auch im Homeoffice.',
        'Laufende Gespräche (WhatsApp, Telefon) zu Ende bringen oder dem Gegenüber sagen, wann du dich meldest.',
        'Feierabend: offene Chats und Rückrufe des Tages prüfen – beantworten oder als Aufgabe mit Datum anlegen.',
        'Status in Cloud und Close aktualisieren (Aufgaben verschieben, Ergebnisse eintragen, Notizen vollständig).',
        'Übergaben an Kollegen schriftlich: Was ist offen, was ist der nächste Schritt, bis wann.',
        'Clean Desk: keine Ausdrucke mit Personendaten liegen lassen, Notizzettel vernichten.',
        'Rechner sperren oder herunterfahren.',
      ],
      checkliste: ['Offene Chats beantwortet oder terminiert', 'Rückrufe des Tages erledigt oder als Aufgabe angelegt', 'Status in Cloud/Close aktuell', 'Übergaben schriftlich gemacht', 'Keine Papiere mit Personendaten am Platz', 'Rechner gesperrt/aus'],
      review: ['Am nächsten Morgen gab es keine Rückfrage, die eine Übergabe hätte klären können', 'Kein Lead hat über Nacht ohne Antwort gewartet, der hätte beantwortet werden können'],
      fehler: ['Rechner offen lassen „nur für eine Minute“.', 'Übergaben nur mündlich.'],
    },
  },
  {
    slug: 'datenschutz-alltag', typ: 'sop', titel: 'Datenschutz im Alltag (DSGVO)', modul: 'Arbeitsweise & Regeln', positionen: ['grundlagen'], status: 'entwurf', prioritaet: 1, reihenfolge: 12,
    zusammenfassung: 'Wie du mit Bewerber- und Kundendaten umgehst – die Regeln, die jeden Tag gelten.',
    abschnitte: {
      zweck: 'Wir verarbeiten Daten von Bewerbern und Kunden. Ein Fehler kann teuer werden und Vertrauen kosten.',
      ausloeser: 'Immer, wenn du mit Namen, Telefonnummern, Lebensläufen oder Gesprächen arbeitest.',
      automatisch: ['Die Cloud löscht bzw. anonymisiert Bewerberdaten nach der Aufbewahrungsfrist automatisch.', 'Abmeldungen per WhatsApp („Stopp“) werden erkannt und der Kontakt wird nicht mehr angeschrieben.'],
      schritte: [
        'Personendaten nur in der Cloud, in Close und in den freigegebenen Tools bearbeiten – nie in privaten Notizen, privaten Chats oder privatem Speicher.',
        'Keine Lebensläufe, Screenshots oder Listen per privatem WhatsApp, privater Mail oder USB weitergeben.',
        'Daten nur an den Kunden weitergeben, dem der Bewerber zugeordnet ist – nie an andere Kunden.',
        'Wer sich abmeldet oder Löschung verlangt: in der Cloud als Opt-out markieren und Felix bzw. Führung informieren.',
        'Telefonate mit Bewerbern nicht ohne Zustimmung aufzeichnen.',
        'Verdacht auf Datenpanne (falscher Empfänger, verlorenes Gerät): sofort Felix informieren – innerhalb von Stunden, nicht Tagen.',
      ],
      checkliste: ['Daten nur in Cloud/Close/freigegebenen Tools', 'Keine Weitergabe über private Kanäle', 'Opt-outs eingetragen', 'Panne sofort gemeldet (falls passiert)'],
      review: ['Ich habe keine Personendaten außerhalb der freigegebenen Tools gespeichert', 'Jeder Opt-out der Woche ist in der Cloud markiert'],
    },
    inhalt: md(E('Wer ist Datenschutz-Ansprechpartner? Gibt es eine schriftliche Datenschutz-Richtlinie, die jeder unterschreibt?')),
  },
  {
    slug: 'interne-kommunikation', typ: 'sop', titel: 'Interne Kommunikation, Übergaben und Eskalation', modul: 'Arbeitsweise & Regeln', positionen: ['grundlagen'], status: 'entwurf', prioritaet: 2, reihenfolge: 13,
    zusammenfassung: 'Welcher Kanal wofür, wie schnell wir antworten und wie eine gute Übergabe aussieht.',
    abschnitte: {
      zweck: 'Weniger Rückfragen, keine verlorenen Infos, klare Zuständigkeit.',
      schritte: [
        'Aufgaben gehören in die Cloud (Meine Aufgaben, Kommentar am Kunden-Schritt) – nicht in Chats.',
        'Kurze Abstimmung im Team-Kanal; alles, was später jemand nachlesen muss, als Kommentar in der Cloud.',
        'Übergabe immer mit: Kunde/Vorgang, aktueller Stand, nächster Schritt, Frist, wo die Infos liegen.',
        'Eskalation: zuerst selbst lösen (SOP, Akademie-Bot), dann Kollege der Rolle, dann Führung – mit Lösungsvorschlag.',
        'Dringend (Kunde verärgert, Kampagne gestoppt, Datenpanne): sofort anrufen statt schreiben.',
      ],
      checkliste: ['Aufgabe/Info in der Cloud dokumentiert', 'Übergabe enthält Stand, nächsten Schritt, Frist', 'Bei Eskalation Lösungsvorschlag mitgegeben'],
      review: ['Niemand musste nachfragen, was gemeint war', 'Dringendes wurde telefonisch eskaliert'],
    },
    inhalt: md(E('Welche Kanäle nutzt ihr (Slack, WhatsApp-Gruppe, Mail)? Welche Antwortzeit gilt intern?')),
  },
  {
    slug: 'kundenkommunikation', typ: 'sop', titel: 'Mit Kunden kommunizieren', modul: 'Arbeitsweise & Regeln', positionen: ['grundlagen'], status: 'entwurf', video_key: 'mindset_kunde', prioritaet: 1, reihenfolge: 14,
    zusammenfassung: 'Ton, Kanäle, Antwortzeiten, Erwartungsmanagement – und was du nie zusagst.',
    abschnitte: {
      zweck: 'Kunden fühlen sich gut betreut und wissen immer, woran sie sind.',
      ausloeser: 'Jede Nachricht, jeder Anruf, jede Mail an einen Kunden.',
      automatisch: ['Willkommens-Mail, Vertragslink, „Zahlung eingegangen“, Umfragen und Reports verschickt die Cloud bei neuen Kunden automatisch.', 'Erinnerungen an offene Kunden-Aufgaben gehen automatisch per WhatsApp (wenn eingeschaltet).'],
      schritte: [
        'Anrede so, wie im Kunden-Profil hinterlegt (Du oder Sie) – im Zweifel Sie, bis der Kunde das Du anbietet.',
        'Kanal wählen: kurze Info → WhatsApp; Inhalte/Unterlagen → Mail; Probleme, schlechte Nachrichten, Erwartungen → Anruf.',
        'Antworten innerhalb der vereinbarten Zeit; wenn es länger dauert: kurz bestätigen und sagen, bis wann die Antwort kommt.',
        'Klar und konkret schreiben: Was ist passiert, was bedeutet es, was ist der nächste Schritt, bis wann.',
        'Nie zusagen: Zahlen außerhalb der Garantie, Preise/Rabatte, Termine, die nicht abgestimmt sind, „das ist morgen fertig“ ohne Prüfung.',
        'Kritik zuerst anhören und zusammenfassen, dann Lösung anbieten; nicht rechtfertigen.',
        'Ab Unzufriedenheit, Kündigungsandeutung oder rechtlichen Themen: Kundenbetreuung bzw. Felix einbinden.',
        'Wichtige Absprachen als Kommentar am Kunden in der Cloud festhalten.',
      ],
      checkliste: ['Richtige Anrede (Du/Sie)', 'Passender Kanal gewählt', 'Nachricht enthält Stand, Bedeutung, nächsten Schritt, Termin', 'Nichts zugesagt, was nicht abgestimmt ist', 'Absprache in der Cloud dokumentiert'],
      review: ['Der Kunde musste nicht nachfragen', 'Antwortzeit eingehalten', 'Bei Unzufriedenheit rechtzeitig eskaliert'],
      fehler: ['Schlechte Nachrichten per WhatsApp statt Anruf.', 'Versprechen machen, um eine Situation zu beruhigen.'],
    },
    inhalt: md(E('Welche Antwortzeit garantieren wir Kunden (z. B. werktags 4 Stunden)? Wer ist Hauptansprechpartner des Kunden?')),
  },
  {
    slug: 'beschwerden', typ: 'sop', titel: 'Schwierige Kunden und Beschwerden', modul: 'Arbeitsweise & Regeln', positionen: ['grundlagen', 'csm'], status: 'entwurf', prioritaet: 2, reihenfolge: 15,
    zusammenfassung: 'Ruhig bleiben, verstehen, lösen – und wann du abgibst.',
    abschnitte: {
      zweck: 'Beschwerden werden zur Chance statt zur Kündigung.',
      schritte: [
        'Zuhören, ausreden lassen, nicht unterbrechen.',
        'Zusammenfassen: „Wenn ich dich richtig verstehe, geht es um … – stimmt das?“',
        'Verständnis zeigen, ohne Schuld zu verteilen oder Fehler abzustreiten.',
        'Fakten prüfen (Kunden-Ablauf, Kennzahlen, Gesprächsverlauf), bevor du inhaltlich antwortest.',
        'Konkreten nächsten Schritt mit Termin anbieten; nur zusagen, was sicher ist.',
        'Eskalieren an Kundenbetreuung/Felix bei: Kündigungsandrohung, Geld/Garantie, rechtlichen Themen, wiederholter Beschwerde.',
        'Beschwerde und Lösung als Kommentar am Kunden dokumentieren.',
      ],
      checkliste: ['Zugehört und zusammengefasst', 'Fakten geprüft', 'Nächster Schritt mit Termin vereinbart', 'Eskaliert, falls Kriterium erfüllt', 'Dokumentiert'],
      review: ['Der Kunde hat am Ende einen klaren nächsten Schritt', 'Zusage eingehalten', 'Ursache an das Team weitergegeben, damit es nicht wieder passiert'],
    },
  },
  {
    slug: 'abwesenheit', typ: 'wissen', titel: 'Krankmeldung, Urlaub und Vertretung', modul: 'Arbeitsweise & Regeln', positionen: ['grundlagen'], status: 'entwurf', prioritaet: 3, reihenfolge: 16,
    zusammenfassung: 'Wie du dich abmeldest und deine Arbeit übergibst.',
    inhalt: md(
      '## Krankmeldung',
      E('Bis wann und bei wem meldest du dich krank? Ab welchem Tag braucht es eine AU?'),
      '',
      '## Urlaub',
      E('Wie und wie lange vorher wird Urlaub beantragt? Wer genehmigt?'),
      '',
      '## Vertretung',
      '- Vor der Abwesenheit: offene Aufgaben übergeben (siehe „Interne Kommunikation“), Abwesenheitsnotiz in Mail, Kunden informieren, die dich direkt kontaktieren.',
      E('Wer vertritt welche Rolle?'),
    ),
    abschnitte: {
      checkliste: ['Abwesenheit rechtzeitig gemeldet', 'Offene Aufgaben übergeben', 'Abwesenheitsnotiz aktiv', 'Direkte Kunden informiert'],
      review: ['Während meiner Abwesenheit ist nichts liegen geblieben'],
    },
  },
];

/* ── Innendienst ─────────────────────────────────────────────────────── */

const INNENDIENST: ArtikelDef[] = [
  {
    slug: 'innendienst-auftrag', typ: 'wissen', titel: 'Innendienst: Aufgabe und Zielvorgaben', modul: 'Innendienst', positionen: ['innendienst'], status: 'entwurf', prioritaet: 1, reihenfolge: 1,
    zusammenfassung: 'Was der Innendienst verantwortet und woran Erfolg gemessen wird.',
    inhalt: md(
      '## Deine Aufgabe',
      'Du sorgst dafür, dass aus Bewerbern unserer Kunden Termine und Starter werden: Bewerber anrufen, qualifizieren, Termine im Kalender des Kunden legen, Bewerber durch die Pipeline führen.',
      '',
      '## Was die Cloud dir abnimmt',
      '- Der WhatsApp-Bot schreibt neue Bewerber sofort an und stellt Vorab-Fragen.',
      '- Die Kadenz plant Anrufe automatisch: erster Anruf 15 Minuten nach Eingang, insgesamt bis zu 6 Versuche über ca. eine Woche in wechselnden Zeitfenstern (9, 14, 18 Uhr).',
      '- Nach 6 erfolglosen Versuchen stoppt die Kadenz von selbst.',
      '',
      '## Zielvorgaben',
      '- Speed-to-Lead: neue Bewerber so schnell wie möglich anrufen – die Kadenz setzt den ersten Versuch auf 15 Minuten.',
      '- Jeder fällige Anruf aus der Warteschlange wird am selben Tag erledigt.',
      E('Anrufe pro Tag, Erreichbarkeitsquote, Terminquote, Starter pro Monat – welche Zahlen gelten?'),
      '',
      '## Tagesablauf',
      '- 09:00 Warteschlange: fällige Anrufe (Vormittagsfenster), neue Bewerber zuerst',
      '- 11:00 WhatsApp-Inbox: offene Antworten, Rückfragen',
      '- 14:00 Nachmittagsfenster: Anrufe',
      '- 16:00 Termine bestätigen, No-Shows nachfassen, Dokumentation',
      '- 18:00 Abendfenster (falls deine Arbeitszeit das abdeckt)',
      E('Stimmen diese Zeiten mit euren Arbeitszeiten überein? Wer deckt das Abendfenster ab?'),
    ),
    abschnitte: {
      checkliste: ['Ziele meiner Rolle gelesen', 'Kadenz verstanden (15 Min., 6 Versuche, 3 Zeitfenster)', 'Tagesablauf mit meinen Arbeitszeiten abgestimmt'],
      review: ['Ich kenne meine Zahlen der letzten Woche', 'Keine fällige Anruf-Aufgabe von gestern ist offen'],
    },
  },
  {
    slug: 'innendienst-anruf', typ: 'sop', titel: 'Bewerber anrufen von A bis Z', modul: 'Innendienst', positionen: ['innendienst'], status: 'entwurf', video_key: 'innendienst_anruf', prioritaet: 1, reihenfolge: 2,
    zusammenfassung: 'Vorbereitung, Gespräch, Termin, Dokumentation – jeder Anruf gleich gut.',
    abschnitte: {
      zweck: 'Aus einem Bewerber wird ein qualifizierter Termin beim Kunden.',
      ausloeser: 'Fällige Anruf-Aufgabe in der Warteschlange oder neuer Bewerber.',
      automatisch: ['Die Kadenz legt Anruf-Aufgaben in der Warteschlange an.', 'Der Bot hat oft schon Vorab-Fragen gestellt – die Antworten stehen im Bewerberprofil bzw. im WhatsApp-Verlauf.', 'Das Anruf-Ergebnis steuert den nächsten Kadenz-Schritt automatisch.'],
      schritte: [
        'Vorbereitung (1 Minute): Bewerberprofil öffnen – Quelle (Meta, Indeed, Funnel), Stelle, Antworten aus Funnel/Bot, WhatsApp-Verlauf, frühere Anrufe.',
        'Begrüßung: Name, Firma, Grund („Du hattest dich auf … beworben, hast du kurz zwei Minuten?“).',
        'Wenn es gerade nicht passt: Rückrufzeit vereinbaren und im Dialer als „erneut anrufen“ mit Zeit eintragen.',
        'Qualifizieren mit den Fragen der Stelle (z. B. Verfügbarkeit, Region, Erfahrung, Führerschein falls nötig, Erwartungen).',
        'Passt der Bewerber: Termin im Kalender des Kunden legen (Buchungslink bzw. Termin anbieten) und Datum/Uhrzeit wiederholen.',
        'Passt er nicht: freundlich absagen oder auf andere Stelle hinweisen, Status in der Pipeline setzen.',
        'Abschluss: nächste Schritte nennen (Bestätigung per WhatsApp, Erinnerung kommt automatisch).',
        'Sofort dokumentieren: Anruf-Ergebnis im Dialer, Notiz mit Kernaussagen, Pipeline-Status.',
      ],
      checkliste: ['Profil, Quelle und WhatsApp-Verlauf gelesen', 'Grund des Anrufs genannt', 'Qualifizierungsfragen gestellt', 'Termin gelegt oder sauber abgesagt', 'Termin wiederholt und Bestätigung angekündigt', 'Anruf-Ergebnis und Notiz eingetragen', 'Pipeline-Status gesetzt'],
      review: ['Notiz reicht, damit der Kunde den Bewerber versteht', 'Termin liegt in den Verfügbarkeiten des Kunden', 'Kein Bewerber ohne Ergebnis im Dialer', 'Freundlicher Ton auch bei Absage'],
      fehler: ['Anrufen, ohne den WhatsApp-Verlauf zu kennen – der Bewerber hat Fragen schon beantwortet.', 'Ergebnis „später“ eintragen – dann plant die Kadenz falsch.'],
      links: [L('Dialer', '/dialer'), L('Innendienst', '/innendienst')],
    },
    inhalt: md('## Gesprächsleitfaden', 'Siehe „Skript: Bewerber-Anruf (Innendienst)“.'),
  },
  {
    slug: 'innendienst-nicht-erreicht', typ: 'sop', titel: 'Bewerber nicht erreicht: Kadenz, Mailbox, WhatsApp', modul: 'Innendienst', positionen: ['innendienst'], status: 'entwurf', prioritaet: 1, reihenfolge: 3,
    zusammenfassung: 'Was du tust, wenn niemand rangeht – und was die Cloud übernimmt.',
    abschnitte: {
      zweck: 'Kein Bewerber geht verloren, nur weil er beim ersten Mal nicht rangeht.',
      automatisch: ['Nach „nicht erreicht“ plant die Kadenz den nächsten Versuch automatisch in einem anderen Zeitfenster (bis zu 6 Versuche).', 'Nach dem letzten Versuch stoppt die Kadenz.'],
      schritte: [
        'Ergebnis „nicht erreicht“ bzw. „Mailbox“ sofort im Dialer eintragen.',
        'Mailbox: nur kurz Name, Firma, Grund und Rückrufnummer.',
        'Wenn im 24-Stunden-Fenster: kurze WhatsApp („Hab dich gerade nicht erreicht – wann passt dir ein kurzer Anruf?“), sonst passende WhatsApp-Vorlage.',
        'Ruft der Bewerber zurück: Anruf wie gewohnt führen, Kadenz-Aufgaben erledigen sich mit dem Ergebnis.',
      ],
      checkliste: ['Ergebnis im Dialer eingetragen', 'Mailbox-Nachricht kurz und mit Rückrufnummer', 'WhatsApp bzw. Vorlage gesendet'],
      review: ['Jeder nicht erreichte Bewerber hat einen geplanten nächsten Versuch', 'Keine doppelten Nachrichten an denselben Bewerber am selben Tag'],
    },
    inhalt: md(E('Sprechen wir überhaupt auf Mailboxen? Gibt es eine feste WhatsApp-Vorlage für „nicht erreicht“?')),
  },
  {
    slug: 'innendienst-optout', typ: 'sop', titel: 'Abmeldung, Absage und schwierige Fälle', modul: 'Innendienst', positionen: ['innendienst'], status: 'entwurf', prioritaet: 2, reihenfolge: 4,
    zusammenfassung: 'Opt-out, unfreundliche Bewerber, falsche Nummern, Minderjährige – richtig reagieren.',
    abschnitte: {
      zweck: 'Rechtssicher und respektvoll bleiben, auch wenn es unangenehm wird.',
      automatisch: ['„Stopp“ per WhatsApp wird erkannt; der Kontakt wird nicht mehr angeschrieben.'],
      schritte: [
        'Bewerber will keinen Kontakt mehr: sofort Opt-out in der Cloud setzen, freundlich bestätigen, Gespräch beenden.',
        'Falsche Nummer: entschuldigen, Kontakt als ungültig markieren, keine weiteren Versuche.',
        'Unfreundlich oder beleidigend: ruhig bleiben, Gespräch höflich beenden, Notiz schreiben.',
        'Unter 18 oder offensichtlich ungeeignet für die Stelle: Kriterien der Stelle prüfen, ggf. freundlich absagen.',
        'Bewerber fragt nach Gehalt/Details, die du nicht kennst: nicht raten – an den Termin beim Kunden verweisen.',
      ],
      checkliste: ['Opt-out gesetzt (falls gewünscht)', 'Ungültige Nummer markiert', 'Notiz zum Fall geschrieben'],
      review: ['Kein Kontakt nach Abmeldung', 'Keine Aussagen zu Gehalt/Bedingungen ohne Grundlage'],
    },
  },
  {
    slug: 'skript-innendienst-bewerber', typ: 'skript', titel: 'Skript: Bewerber-Anruf (Innendienst)', modul: 'Innendienst', positionen: ['innendienst'], status: 'entwurf', prioritaet: 1, reihenfolge: 5,
    zusammenfassung: 'Leitfaden für den Anruf bei Bewerbern unserer Kunden.',
    inhalt: md(
      '## 1. Begrüßung und Erlaubnis',
      E('Genauer Wortlaut: Wie stellst du dich vor (eigener Name, „im Auftrag von [Kunde]“ oder „Zoepp Media“)?'),
      '## 2. Bezug zur Bewerbung',
      E('Wie greifst du die Bewerbung auf (Stelle, Quelle)?'),
      '## 3. Qualifizierung',
      E('Welche Fragen stellst du immer? Welche je Branche (z. B. Strom/Gas, Glasfaser, PV)? Was sind K.-o.-Kriterien?'),
      '## 4. Termin',
      E('Wie leitest du in den Termin über? Telefon oder vor Ort? Wer ist im Termin beim Kunden?'),
      '## 5. Abschluss',
      E('Wie verabschiedest du dich, was kündigst du an (Bestätigung, Erinnerung)?'),
      '',
      'Tipp: Gute Anrufe aufnehmen bzw. als Gespräch unter „Wissen einspeisen“ hochladen – daraus entsteht das Skript.',
    ),
  },
];

/* ── Setting ─────────────────────────────────────────────────────────── */

const SETTING: ArtikelDef[] = [
  {
    slug: 'setting-auftrag', typ: 'wissen', titel: 'Setting: Aufgabe, Zielvorgaben und Auslastung', modul: 'Setting', positionen: ['setting'], status: 'entwurf', video_key: 'setting_tag', prioritaet: 1, reihenfolge: 1,
    zusammenfassung: 'Was Setter verantworten und welche Zahlen gelten.',
    inhalt: md(
      '## Deine Aufgabe',
      'Du führst Erstgespräche (Settings) mit Interessenten, qualifizierst sie und legst passende Leads in den Closing-Termin. Dazu gehören konsequente Follow-ups.',
      '',
      '## Zielvorgaben',
      `- Mindestens **${S.followupsMin} Setting-Follow-ups pro Tag** neben deinen Terminen.`,
      `- Gehaltene Settings pro Tag: unter ${S.settingMin} = nicht ausgelastet, **${S.settingOptimal} = optimal**, bis ${S.settingMax} = fast voll, darüber überlastet. Theoretisches Maximum: ${S.settingKapazitaet} (15 Minuten je Setting, 8 Stunden minus 1 Stunde Pause).`,
      '- Die Auswertung siehst du unter Vertrieb → Team & Auslastung.',
      '',
      '## Wichtig für die Zahlen',
      'Ein Setting zählt für die Person, die den Deal in Close weiterschiebt. Setze den Status deshalb selbst und sofort nach dem Gespräch.',
      '',
      '## Tagesablauf',
      E('Wann sind Setting-Blöcke, wann Follow-up-Blöcke? Gibt es ein Daily?'),
    ),
    abschnitte: {
      checkliste: ['Zielvorgaben gelesen', 'Team & Auslastung einmal angesehen', 'Weiß, dass ich den Close-Status selbst setze'],
      review: [`Diese Woche Ø mindestens ${S.followupsMin} Follow-ups pro Tag`, `Ø Settings pro Tag im Bereich ${S.settingMin}–${S.settingMax}`],
    },
  },
  {
    slug: 'setting-gespraech', typ: 'sop', titel: 'Ein Setting führen und dokumentieren', modul: 'Setting', positionen: ['setting'], status: 'entwurf', video_key: 'setting_tag', prioritaet: 1, reihenfolge: 2,
    zusammenfassung: 'Vom Termin bis zur sauberen Übergabe an den Closer.',
    abschnitte: {
      zweck: 'Nur passende Leads gehen ins Closing – mit allen Infos, die der Closer braucht.',
      ausloeser: 'Gebuchter Setting-Termin (Calendly) oder Rückruf.',
      automatisch: ['Calendly-Buchungen landen in Close, Bestätigung und Erinnerungen per WhatsApp verschickt die Cloud.', 'Fireflies zeichnet das Gespräch auf; die KI schreibt eine Kurz-Notiz an den Lead in Close.', 'No-Shows lösen eine WhatsApp aus, sobald du den Status „Setting - No Show“ setzt.'],
      schritte: [
        'Vorbereitung: Lead in Close öffnen – Quelle, Funnel-Antworten (Teamgröße, Problem), frühere Notizen.',
        'Gespräch nach Setting-Skript: Rahmen, Situation, Problem, Ziel, Qualifizierung.',
        'Passt der Lead: Closing-Termin direkt im Gespräch buchen.',
        'Passt er nicht: ehrlich sagen, Status „verloren“ mit Grund.',
        'Unentschlossen: Status „Setting - Follow Up“ und Rhythmus-Feld setzen – die Cloud startet die Follow-up-Kette.',
        'Status in Close sofort setzen und Notiz ergänzen (KI-Notiz prüfen, Fehlendes nachtragen).',
      ],
      checkliste: ['Lead-Infos vorher gelesen', 'Situation, Problem, Ziel erfragt', 'Qualifizierung entschieden', 'Closing-Termin gebucht oder Follow-up/verloren gesetzt', 'Close-Status sofort gesetzt', 'Notiz für den Closer vollständig'],
      review: ['Closer musste nichts nachfragen', 'Kein Setting ohne Status am Tagesende', 'Follow-up-Rhythmus gesetzt, wo nötig'],
      links: [L('Vertrieb', '/admin/vertrieb')],
    },
  },
  {
    slug: 'setting-followups', typ: 'sop', titel: `Setting-Follow-ups: mindestens ${S.followupsMin} am Tag`, modul: 'Setting', positionen: ['setting'], status: 'entwurf', video_key: 'setting_tag', prioritaet: 1, reihenfolge: 3,
    zusammenfassung: 'Follow-up-Liste systematisch abarbeiten und No-Shows zurückholen.',
    abschnitte: {
      zweck: 'Die meisten Abschlüsse entstehen aus Follow-ups und zurückgeholten No-Shows.',
      automatisch: ['Die WhatsApp-Follow-up-Kette läuft je nach Rhythmus-Feld automatisch.', 'Zählung: Anwahlen bei Leads im Status Setting-Follow-up oder Setting-No-Show zählen als Follow-up.'],
      schritte: [
        'Liste in Close filtern: Status „Setting - Follow Up“ und „Setting - No Show“, älteste zuerst.',
        'Anrufen; nicht erreicht → kurze WhatsApp, nächsten Versuch als Close-Aufgabe.',
        'Erreicht: Termin neu legen (zählt als Rückholung) oder Status sauber setzen.',
        'Am Tagesende Zahl prüfen (Team & Auslastung): Ziel mindestens ' + S.followupsMin + '.',
      ],
      checkliste: ['Follow-up- und No-Show-Liste gefiltert', `Mindestens ${S.followupsMin} Anwahlen`, 'Jeder Lead hat einen Status oder eine Aufgabe', 'Zurückgeholte Termine eingetragen'],
      review: ['Kein Follow-up-Lead älter als 14 Tage ohne Kontakt', 'Rückholquote der Woche angesehen'],
    },
  },
];

/* ── Closing ─────────────────────────────────────────────────────────── */

const CLOSING: ArtikelDef[] = [
  {
    slug: 'closing-auftrag', typ: 'wissen', titel: 'Closing: Aufgabe und Zielvorgaben', modul: 'Closing', positionen: ['closing'], status: 'entwurf', prioritaet: 1, reihenfolge: 1,
    zusammenfassung: 'Was Closer verantworten und welche Zahlen gelten.',
    inhalt: md(
      '## Deine Aufgabe',
      'Du führst Abschlussgespräche (Closing, CC2), erstellst Angebote und bringst Kunden zur Entscheidung. Nach dem Abschluss startest du mit dem After-Close-Formular die Fulfillment-Maschine.',
      '',
      '## Zielvorgaben',
      `- Gehaltene Closings pro Tag: mindestens **${S.closingMin}**, optimal ${S.closingMin}–${S.closingOptimal}; ab ${S.closingUeberlastet} überlastet.`,
      '- Auftragsvolumen-Ziel des Teams: siehe Sales-Controlling.',
      E('Abschlussquote, Ø Auftragswert, Rabattregeln – welche Zahlen und Grenzen gelten?'),
    ),
    abschnitte: {
      checkliste: ['Zielvorgaben gelesen', 'Pakete und Preise kenne ich (siehe Closing-Skript)'],
      review: [`Ø mindestens ${S.closingMin} gehaltene Closings pro Tag diese Woche`],
    },
  },
  {
    slug: 'closing-gespraech', typ: 'sop', titel: 'Closing vorbereiten, führen und nachbereiten', modul: 'Closing', positionen: ['closing'], status: 'entwurf', video_key: 'closing_ablauf', prioritaet: 1, reihenfolge: 2,
    zusammenfassung: 'Vom Termin bis zum After-Close – ohne Lücke.',
    abschnitte: {
      zweck: 'Jedes Closing endet mit einer klaren Entscheidung und sauberem Status.',
      automatisch: ['Fireflies-Protokoll und KI-Notiz am Lead in Close.', 'Bei „Gewonnen“ + After-Close: Vertrag, Rechnungsaufgabe und Onboarding laufen automatisch.'],
      schritte: [
        'Vorbereitung: Setting-Notiz, KI-Gesprächsnotiz, Funnel-Antworten lesen; Entscheider bestätigen.',
        'Gespräch nach Closing-Skript: Rahmen, Analyse, Lösung & Garantie, Preis, Abschlussfrage.',
        'Einwände nach Einwandbehandlung aufnehmen.',
        'Ergebnis sofort in Close: Gewonnen, Angebot, Closing-Follow-up (mit Rhythmus) oder Verloren mit Grund.',
        'Bei Gewonnen: After-Close-Formular in der Cloud ausfüllen (Paket, Preise, Laufzeit, Start, Garantieziel).',
      ],
      checkliste: ['Setting- und KI-Notiz gelesen', 'Entscheider im Gespräch', 'Abschlussfrage gestellt', 'Close-Status gesetzt', 'Bei Gewonnen: After-Close abgeschickt'],
      review: ['Angebot/Paket im After-Close stimmt mit dem Gespräch überein', 'Kein Closing ohne Status am Tagesende', 'Garantieziel eingetragen'],
      links: [L('After-Close', '/admin/after-close')],
    },
  },
];

/* ── Kundenbetreuung ─────────────────────────────────────────────────── */

const KUNDENBETREUUNG: ArtikelDef[] = [
  {
    slug: 'csm-auftrag', typ: 'wissen', titel: 'Kundenbetreuung: Aufgabe, Rhythmus und Zielvorgaben', modul: 'Kundenbetreuung', positionen: ['csm'], status: 'entwurf', prioritaet: 1, reihenfolge: 1,
    zusammenfassung: 'Vom Vertrag bis zur Verlängerung: wer was wann macht.',
    inhalt: md(
      '## Deine Aufgabe',
      'Du begleitest Kunden vom Vertrag über Kick-off, Setup und laufende Kampagne bis zur Verlängerung. Ziel: Garantie erreichen, Kunde zufrieden, Verlängerung oder Upsell.',
      '',
      '## Was die Cloud übernimmt (bei Kunden mit Automatik)',
      '- Vertrag, Rechnungsaufgabe, Zahlungserkennung, Onboarding-Start, Setup nach dem Onboarding.',
      '- Umfragen mit Folgeaufgaben, Reports an Tag 7/14, Garantie-Ampel, Verlängerungsaufgaben 30/14 Tage vor Ende.',
      '',
      '## Zielvorgaben',
      E('Zufriedenheit (Ø Umfragenote), Verlängerungsquote, Reaktionszeit – welche Zahlen gelten?'),
      '',
      '## Kontakt-Rhythmus',
      E('Wie oft meldest du dich bei jedem Kunden, über welchen Kanal, mit welchem Inhalt (z. B. Wochen-Update)?'),
    ),
    abschnitte: {
      checkliste: ['Aufgabe und Automatik verstanden', 'Kontakt-Rhythmus je Kunde festgelegt'],
      review: ['Jeder meiner Kunden hatte im vereinbarten Rhythmus Kontakt', 'Rote Garantie-Ampeln haben einen Plan'],
    },
  },
];

/* ── Handwerk Marketing ──────────────────────────────────────────────── */

const MARKETING: ArtikelDef[] = [
  {
    slug: 'creatives-erstellen', typ: 'sop', titel: 'Creatives erstellen (Bild-Ads)', modul: 'Handwerk Marketing', positionen: ['media_buyer', 'content'], status: 'entwurf', video_key: 'creatives', prioritaet: 1, reihenfolge: 1,
    zusammenfassung: 'Vom Briefing zur freigabefähigen Grafik in allen Formaten.',
    abschnitte: {
      zweck: 'Anzeigen, die auffallen, die richtigen Bewerber ansprechen und Metas Regeln einhalten.',
      ausloeser: 'Neue Kampagne, Continuity-Check mit schwachen Anzeigen, Kundenwunsch.',
      automatisch: ['Der KI-Generator erstellt Ad-Ideen und Bild-Prompts aus dem Onboarding.', 'Bei Kunden mit Automatik erzeugt die Cloud je Grafik-Ad drei KI-Bildvarianten (1:1 und Hochformat).', 'Die KI-Prüfung bewertet jede Ad vor der Kundenfreigabe.'],
      schritte: [
        'Briefing lesen: Stelle, Region, Verdienst, Zielgruppe, Bilder des Kunden, Tonalität.',
        'Hook festlegen: Was lässt die Zielgruppe stoppen? (z. B. konkreter Verdienst, Region, Problem „keine Lust mehr auf …“).',
        'Bild wählen: echte Kunden-/Teamfotos > KI-Bild > Stock. KI-Varianten in der Cloud ansehen und die beste wählen.',
        'Text auf dem Bild: maximal 5–7 Wörter, groß, kontrastreich; Rest gehört in den Anzeigentext.',
        'Formate anlegen: 1:1 (Feed), 4:5 (Feed mobil), 9:16 (Story/Reels) – wichtige Elemente im sicheren Bereich (oben/unten ca. 14 % frei bei 9:16).',
        'Marke prüfen: Logo/Farben des Kunden, keine fremden Marken.',
        'Meta-Regeln für Stellenanzeigen (Sonderkategorie Beschäftigung): keine Diskriminierung nach Alter, Geschlecht, Herkunft; keine unrealistischen Verdienstversprechen, kein „Schnell reich“.',
        'Datei benennen (Kunde_Kampagne_Format_Version) und im Ads-Board an der Ad hochladen.',
      ],
      checkliste: ['Briefing gelesen', 'Hook formuliert', 'Bild gewählt (KI-Variante oder eigenes)', 'Text auf Bild ≤ 7 Wörter, gut lesbar', 'Formate 1:1, 4:5, 9:16 vorhanden', 'Sicherer Bereich eingehalten', 'Meta-Regeln Beschäftigung geprüft', 'Datei benannt und im Ads-Board hochgeladen'],
      review: ['Grafik ist auf dem Handy in 1 Sekunde verständlich', 'Kein diskriminierender oder übertriebener Inhalt', 'KI-Prüfung grün oder gelb mit erledigten Hinweisen', 'Passt zur Marke des Kunden'],
      fehler: ['Zu viel Text auf dem Bild.', 'Nur ein Format – Story-Platzierungen schneiden ab.', 'Verdienst „bis zu“ ohne realistische Basis.'],
      links: [L('Ads-Board', '/ads')],
    },
    inhalt: md(E('Welches Tool nutzt ihr für Grafiken (Canva, Figma …)? Gibt es Vorlagen je Kunde? Beispiele für Top-Ads?')),
  },
  {
    slug: 'videos-schneiden', typ: 'sop', titel: 'Videos schneiden', modul: 'Handwerk Marketing', positionen: ['media_buyer', 'content'], status: 'entwurf', video_key: 'video_schnitt', prioritaet: 2, reihenfolge: 2,
    zusammenfassung: 'Vom Rohmaterial zur fertigen Video-Ad in drei Formaten.',
    abschnitte: {
      zweck: 'Video-Ads, die in den ersten Sekunden fesseln und ohne Ton verständlich sind.',
      automatisch: ['Der KI-Generator liefert Video-Skripte mit Hook und Aufbau.'],
      schritte: [
        'Rohmaterial sichten, beste Takes markieren; Ton und Licht prüfen.',
        'Hook in die ersten 3 Sekunden: stärkste Aussage oder Frage nach vorn, kein Logo-Intro.',
        'Pausen, Versprecher und „ähm“ rausschneiden; Tempo hoch (Schnitt alle 2–4 Sekunden).',
        'Untertitel immer (die meisten schauen ohne Ton), groß, im sicheren Bereich.',
        'Call-to-Action am Ende als Text und gesprochen („Jetzt in 60 Sekunden bewerben“).',
        'Formate exportieren: 9:16 (Reels/Story), 4:5 und 1:1 (Feed).',
        'Export: MP4 (H.264), 1080 px Breite, 30 fps; Länge 15–45 Sekunden.',
        'Benennen (Kunde_Kampagne_Format_Version) und im Ads-Board an der Video-Ad hochladen.',
      ],
      checkliste: ['Beste Takes gewählt', 'Hook in den ersten 3 Sekunden', 'Pausen/Versprecher entfernt', 'Untertitel vorhanden', 'CTA am Ende', 'Formate 9:16, 4:5, 1:1 exportiert', 'Export MP4/H.264/1080 px', 'Benannt und hochgeladen'],
      review: ['Video ohne Ton verständlich', 'Erste 3 Sekunden machen neugierig', 'Untertitel ohne Tippfehler und nicht verdeckt', 'Länge 15–45 Sekunden'],
    },
    inhalt: md(E('Welches Schnitt-Tool nutzt ihr (z. B. CapCut, Premiere)? Gibt es Vorlagen für Untertitel/Branding?')),
  },
  {
    slug: 'skripte-schreiben', typ: 'sop', titel: 'Video-Skripte, Ad-Texte und Funnel-Texte schreiben', modul: 'Handwerk Marketing', positionen: ['media_buyer', 'content'], status: 'entwurf', video_key: 'skripte_schreiben', prioritaet: 1, reihenfolge: 3,
    zusammenfassung: 'Mit dem KI-Generator starten, dann gezielt überarbeiten.',
    abschnitte: {
      zweck: 'Texte, die die richtigen Bewerber ansprechen und zur Bewerbung führen.',
      automatisch: ['Der KI-Generator schreibt nach dem Onboarding Ad-Texte, Video-Skripte, Funnel-Texte und die Indeed-Anzeige.'],
      schritte: [
        'Generator-Ergebnis öffnen und gegen das Briefing prüfen (Stelle, Verdienst, Region, Anrede).',
        'Aufbau prüfen: Hook → Problem/Wunsch der Zielgruppe → Angebot (Stelle, Vorteile) → konkreter nächster Schritt.',
        'Hook-Formeln: Frage („Keine Lust mehr auf …?“), Zahl („3.500 € …“ nur wenn belegt), Ansprache der Region, Gegensatz.',
        'Kurz und mündlich schreiben: kurze Sätze, Du/Sie wie beim Kunden, keine Fachbegriffe.',
        'Fakten prüfen: Verdienst, Bedingungen, Benefits nur aus dem Briefing.',
        'Video-Skript: max. 45 Sekunden Sprechzeit (ca. 100–110 Wörter), Regieanweisungen in Klammern.',
        'Zur internen Freigabe geben, danach in „Deine Freigaben“ für den Kunden.',
      ],
      checkliste: ['Gegen Briefing geprüft', 'Hook vorhanden', 'Aufbau Hook → Problem → Angebot → Schritt', 'Fakten belegt', 'Länge passt', 'Intern freigegeben', 'An Kunden zur Freigabe'],
      review: ['Text in 10 Sekunden erfassbar', 'Keine unbelegten Versprechen', 'Anrede durchgehend gleich', 'Kunde hat ohne große Änderungen freigegeben'],
    },
  },
  {
    slug: 'freigabe-prozess', typ: 'sop', titel: 'Absegnen lassen: interne Freigabe und Kundenfreigabe', modul: 'Handwerk Marketing', positionen: ['media_buyer', 'content', 'csm'], status: 'entwurf', prioritaet: 1, reihenfolge: 4,
    zusammenfassung: 'Wer gibt was frei, in welcher Reihenfolge, mit welchen Fristen.',
    abschnitte: {
      zweck: 'Nichts geht zum Kunden, was intern nicht geprüft ist – und nichts hängt ewig in Schleifen.',
      automatisch: ['Ads in der Stufe „Freigabe Kunde“ erscheinen beim Kunden unter „Deine Freigaben“; der Kunde wird benachrichtigt.', 'Sind alle Ads freigegeben, hakt die Cloud den Schritt ab (bei Automatik-Kunden startet danach der Funnel-Bau).'],
      schritte: [
        'Selbst-Review mit der Review-Checkliste der Ad.',
        'Interne Freigabe durch die zuständige Person.',
        'In der Cloud auf „Freigabe Kunde“ stellen.',
        'Ändert der Kunde etwas: Kommentar lesen, umsetzen, erneut zur Freigabe.',
        'Keine Reaktion des Kunden: nach Frist nachfassen (Kundenbetreuung informieren).',
      ],
      checkliste: ['Selbst-Review gemacht', 'Intern freigegeben', 'An Kunden zur Freigabe gestellt', 'Änderungswünsche umgesetzt'],
      review: ['Höchstens die vereinbarte Zahl an Änderungsschleifen', 'Freigabe innerhalb der Frist'],
    },
    inhalt: md(E('Wer gibt intern frei (je Inhaltstyp)? Welche Frist hat der Kunde? Wie viele Änderungsschleifen sind im Paket enthalten?')),
  },
  {
    slug: 'meta-richtlinien', typ: 'wissen', titel: 'Meta-Regeln für Stellenanzeigen (Sonderkategorie Beschäftigung)', modul: 'Handwerk Marketing', positionen: ['media_buyer', 'content'], status: 'entwurf', prioritaet: 2, reihenfolge: 5,
    zusammenfassung: 'Was bei Recruiting-Anzeigen auf Meta erlaubt ist und was zu Ablehnungen führt.',
    inhalt: md(
      '## Sonderkategorie Beschäftigung',
      'Die Cloud legt Kampagnen mit der Sonderkategorie „Beschäftigung“ an. Dadurch ist das Targeting eingeschränkt: kein Alter unter/über Standard (18–65), kein Geschlecht, keine detaillierten Interessen, Ortsradius mindestens ca. 25 km.',
      '',
      '## Häufige Ablehnungsgründe',
      '- Diskriminierende Formulierungen (Alter, Geschlecht, Herkunft) – auch indirekt („junges Team sucht …“ ist heikel).',
      '- Unrealistische oder irreführende Verdienstversprechen.',
      '- Persönliche Attribute in der Ansprache („Bist du arbeitslos?“).',
      '- Zu viel Text oder reißerische Bilder.',
      '',
      '## Bei Ablehnung',
      'Grund im Werbemanager lesen, Anzeige anpassen, erneut einreichen. Bei wiederholter Ablehnung oder Konto-Einschränkung sofort Führung informieren.',
    ),
    abschnitte: {
      checkliste: ['Regeln gelesen', 'Eigene Ads auf die häufigen Ablehnungsgründe geprüft'],
      review: ['Keine Ablehnung wegen Diskriminierung/Versprechen in diesem Monat'],
    },
  },
];

/* ── Buchhaltung, Operations, Vertriebsleitung ───────────────────────── */

const VERWALTUNG: ArtikelDef[] = [
  {
    slug: 'buchhaltung-monat', typ: 'sop', titel: 'Monatliche Rechnungen und Zahlungsabgleich', modul: 'Buchhaltung', positionen: ['backoffice'], status: 'entwurf', video_key: 'lexware_rechnung', prioritaet: 1, reihenfolge: 1,
    zusammenfassung: 'Laufende Rechnungen schreiben, Zahlungen abgleichen, Offenes nachverfolgen.',
    abschnitte: {
      zweck: 'Jede Leistung wird abgerechnet, jeder Eingang zugeordnet, nichts verjährt.',
      automatisch: ['Lexware gleicht Zahlungen über die Qonto-Verbindung ab.', 'Setup-Rechnungen neuer Kunden erkennt die Cloud in Lexware selbst und startet nach Zahlung das Onboarding.', 'Die Umsatz-Analyse wertet Lexware-Rechnungen nach Neukunde/Bestand/Art aus.'],
      schritte: [
        'Rechnungsliste des Monats in der Cloud öffnen (fällige Monatsbeträge je Kunde).',
        'Rechnungen in Lexware an den richtigen Kontakt schreiben, Leistungszeitraum angeben.',
        'In der Cloud als geschrieben markieren.',
        'Zahlungseingänge in Lexware prüfen; nicht zugeordnete Zahlungen manuell zuordnen.',
        'Offene Rechnungen über Fälligkeit → Mahnwesen.',
      ],
      checkliste: ['Rechnungsliste geprüft', 'Alle Rechnungen geschrieben', 'In der Cloud markiert', 'Zahlungseingänge abgeglichen', 'Überfällige ins Mahnwesen'],
      review: ['Keine fällige Rechnung fehlt', 'Keine Zahlung ohne Zuordnung', 'Umsatz-Analyse plausibel'],
      links: [L('Finanzen', '/admin/finanzen'), L('Umsatz-Analyse', '/admin/umsatz')],
    },
    inhalt: md(E('Bis zu welchem Tag werden Monatsrechnungen geschrieben? Zahlungsziel? Wer bekommt welche Auswertung?')),
  },
  {
    slug: 'ops-systemcheck', typ: 'sop', titel: 'Täglicher System-Check', modul: 'Operations', positionen: ['ops', 'fuehrung'], status: 'entwurf', video_key: 'ops_check', prioritaet: 2, reihenfolge: 1,
    zusammenfassung: 'Prüfen, ob die Automatik läuft – bevor Kunden es merken.',
    abschnitte: {
      zweck: 'Hängende Automatik, fehlerhafte Verbindungen und Lücken früh erkennen.',
      automatisch: ['Die Cloud legt bei Fehlern Benachrichtigungen bzw. Aufgaben an (z. B. Meta-Fehler, Funnel-Bau-Fehler, abgelaufene Perspective-Verbindung, fehlgeschlagene Jobs).'],
      schritte: [
        'Benachrichtigungen der Cloud durchgehen (Glocke).',
        'Kunden mit Automatik: Karten Vertrag/Zahlung, Meta, Funnel auf Fehlerstatus prüfen.',
        'Anbindungen prüfen (Admin → Anbindung): WhatsApp, Perspective, Meta.',
        'Akademie: neue Wissenslücken sichten.',
        'Probleme mit Ursache und Vorschlag an Führung.',
      ],
      checkliste: ['Benachrichtigungen gesichtet', 'Automatik-Karten geprüft', 'Anbindungen grün', 'Wissenslücken gesichtet'],
      review: ['Kein Fehler älter als 24 Stunden ohne Aufgabe'],
      links: [L('Anbindung', '/admin/anbindung')],
    },
  },
  {
    slug: 'vertriebsleitung-routine', typ: 'sop', titel: 'Vertriebsleitung: Wochenroutine und Coaching', modul: 'Vertriebsleitung', positionen: ['vertriebsleitung'], status: 'entwurf', prioritaet: 1, reihenfolge: 1,
    zusammenfassung: 'Zahlen lesen, Auslastung steuern, Gespräche coachen.',
    abschnitte: {
      zweck: 'Das Team erreicht seine Ziele, und Engpässe werden erkannt, bevor sie Umsatz kosten.',
      automatisch: ['Team & Auslastung zeigt Settings/Closings je Person und Tag mit Ampel und meldet, wann ein neuer Setter oder Closer nötig ist.', 'Fireflies + KI liefern Gesprächsnotizen für jedes Setting/Closing.'],
      schritte: [
        'Montags: Sales-Controlling (Woche, Monat) und Team & Auslastung prüfen.',
        `Setter unter ${S.followupsMin} Follow-ups/Tag oder unter ${S.settingMin} Settings: Ursache klären.`,
        'Kapazitätsblick: Hinweis „neuer Setter/Closer nötig“ mit Führung besprechen.',
        'Je Person 1–2 Gespräche pro Woche anhören (Fireflies) und mit der Review-Checkliste des Skripts besprechen.',
        'Close-Qualität stichprobenartig: Status, Notizen, Aufgaben.',
      ],
      checkliste: ['Zahlen der Woche geprüft', 'Ausreißer angesprochen', 'Kapazität bewertet', 'Gespräche gecoacht', 'Close-Stichprobe gemacht'],
      review: ['Jede Person hat diese Woche Feedback bekommen', 'Maßnahmen aus letzter Woche nachverfolgt'],
      links: [L('Vertrieb', '/admin/vertrieb')],
    },
    inhalt: md(E('Feste Meetings (Daily, Weekly)? Welche Zahlen werden wem berichtet?')),
  },
];

/** Arbeiten in der Cloud: Boards und Video-Freigabe (Stand 09.10.2026) */
const BOARDS_VIDEOS: ArtikelDef[] = [
  {
    slug: 'boards-aufgaben', typ: 'sop', titel: 'Boards: Aufgaben anlegen, abarbeiten und übergeben', modul: 'Arbeitsweise & Regeln', positionen: ['grundlagen'], status: 'freigegeben', prioritaet: 1, reihenfolge: 20,
    zusammenfassung: 'Alle Aufgaben laufen über die Boards in der Cloud – nicht über WhatsApp-Zurufe, Zettel oder Monday.',
    abschnitte: {
      zweck: 'Jeder sieht jederzeit, was er heute zu tun hat, was beim Team liegt und was erledigt ist. Nichts geht im Chat verloren.',
      ausloeser: 'Jede neue Aufgabe – egal ob von Felix, aus einem Kundengespräch oder von dir selbst.',
      automatisch: [
        'Jeder Mitarbeiter hat automatisch ein persönliches Board („Mein Board“).',
        'Wer eine Aufgabe zugewiesen bekommt oder kommentiert wird, bekommt Push + Glocke.',
        'Wiederkehrende Aufgaben (täglich, wöchentlich, monatlich) legen sich morgens um 5 Uhr selbst an.',
        'Fortschritt der Checkliste und Anzahl der Kommentare stehen direkt auf der Karte.',
      ],
      schritte: [
        'Cloud → Boards öffnen. Links: „Mein Board“, darunter Team-Boards und (für Admins) die Boards der Kollegen.',
        'Neue Aufgabe: oben ins Feld tippen und Enter. Auf dem Board eines Kollegen landet sie direkt bei ihm.',
        'Karte anklicken → Titel, Beschreibung, Zuständig, Fälligkeit, Priorität, Status pflegen. Ohne Fälligkeit taucht die Aufgabe nicht in der Morgenliste auf.',
        'Größere Aufgaben in Unteraufgaben zerlegen: im Aufgaben-Fenster unter „Checkliste“ Punkte eintippen (Enter) und abhaken.',
        'Rückfragen, Zwischenstände und Links gehören in den „Verlauf“ der Aufgabe (Kommentar, Strg/⌘ + Enter) – nicht in WhatsApp. Zuständige(r) und Ersteller werden benachrichtigt.',
        'Arbeiten: Karte per Drag & Drop von „Offen“ → „In Arbeit“ → „Prüfung“ ziehen. Fertig = Kreis auf der Karte anklicken (geht auch am Handy).',
        'Suchen: oben „Alle Boards durchsuchen“ und Filter Person / Kunde / Priorität. „Nur meine“ zeigt alles, was dir zugewiesen ist – über alle Boards.',
        'Ansicht „Liste“ sortiert nach Überfällig, Heute, Nächste 7 Tage, Später – ideal für den Tagesstart.',
        'Wiederkehrend: Reiter „Wiederkehrend“ → Rhythmus wählen (täglich Mo–Fr, wöchentlich mit Wochentag, monatlich mit Tag; fällt der auf ein Wochenende, kommt die Aufgabe am Freitag davor).',
        'Team-Board anlegen: links „+ Team-Board“. Wer ein Team-Board angelegt hat (und Admins), sieht das Zahnrad neben dem Namen: umbenennen, Beschreibung, Farbe, archivieren. Archivieren geht nur, wenn keine offenen Aufgaben mehr darauf liegen. Archivierte Boards stehen links unten und lassen sich wiederherstellen. Beim eigenen Board ändert das Zahnrad nur die Farbe.',
      ],
      checkliste: [
        'Jede Aufgabe hat einen Zuständigen und – wenn sie zeitkritisch ist – ein Fälligkeitsdatum',
        'Aufgaben mit mehreren Schritten haben eine Checkliste',
        'Rückfragen stehen im Verlauf der Aufgabe, nicht im Chat',
        'Erledigtes ist abgehakt',
        'Keine überfällige Aufgabe ohne Kommentar oder neues Datum',
      ],
      review: ['Morgens: „Nur meine“ zeigt keine überfälligen Aufgaben ohne Kommentar', 'Freitags: Board aufgeräumt, Spalte „Prüfung“ leer oder mit klarer nächster Person'],
      fehler: [
        'Aufgaben per WhatsApp „zurufen“ statt sie anzulegen.',
        'Aufgabe auf „Prüfung“ ziehen, ohne im Verlauf zu schreiben, wer prüfen soll.',
        'Fälligkeit weglassen – dann fehlt die Aufgabe in der Morgenliste.',
      ],
      links: [L('Boards', '/boards')],
    },
  },
  {
    slug: 'boards-sprache-whatsapp', typ: 'sop', titel: 'Aufgaben per Sprachnachricht und WhatsApp – und die Morgenliste', modul: 'Arbeitsweise & Regeln', positionen: ['grundlagen'], status: 'freigegeben', prioritaet: 1, reihenfolge: 21,
    zusammenfassung: 'Aufgaben einsprechen statt tippen, morgens die eigene Liste per WhatsApp bekommen und mit „erledigt 2“ abhaken.',
    abschnitte: {
      zweck: 'Aufgaben entstehen oft unterwegs oder im Gespräch. So landen sie trotzdem sauber auf dem richtigen Board.',
      ausloeser: 'Du hast unterwegs eine Idee, delegierst etwas oder willst morgens wissen, was ansteht.',
      automatisch: [
        'Die KI erkennt aus der Sprachnachricht Titel, zuständige Person, Fälligkeit, Kunde und ob es wiederkehrend ist.',
        'Mo–Fr gegen 7:30 Uhr kommt per WhatsApp „Das steht heute auf deinem Board“ mit nummerierter Liste (überfällige + heute fällige Aufgaben).',
        'Ist die WhatsApp-Vorlage noch nicht freigegeben, kommt die Liste als Push-Benachrichtigung.',
      ],
      schritte: [
        'Voraussetzung: deine Handynummer steht in deinem Profil in der Cloud (genau die Nummer, mit der du WhatsApp nutzt).',
        'In der Cloud: Boards → „Per Sprache“ → einsprechen (max. 9 Minuten), z. B. „Nils, schneid bis Freitag das Ad-Video für Turhan, und jeden Montag die Kunden-Reports raus.“',
        'Vorschau prüfen: Personen, Daten und Kunde kontrollieren, Unpassendes abwählen → „Anlegen“.',
        'Per WhatsApp: Sprachnachricht an die Zoepp-Nummer 030 82684175 schicken – oder Text, der mit „Aufgabe:“ beginnt. Du bekommst eine Zusammenfassung zurück, was angelegt wurde.',
        'Morgenliste: Antworte mit „erledigt 2“ oder „erledigt 1 3“ (auch „2 erledigt“) – die Aufgaben mit diesen Nummern werden abgehakt, du bekommst eine Bestätigung. Aufgaben, die inzwischen jemand anderem zugewiesen wurden, werden nicht abgehakt.',
        'Liste nochmal schicken lassen (z. B. mittags): einfach „liste“ schreiben. Die Nummern gelten dann für die neue Liste.',
      ],
      checkliste: ['Handynummer im Profil eingetragen', 'Sprach-Aufgaben in der Vorschau geprüft', 'Bestätigung nach „erledigt …“ erhalten'],
      review: ['Die per Sprache angelegten Aufgaben haben die richtige Person und das richtige Datum', 'Nach dem Abhaken per WhatsApp stimmt das Board'],
      fehler: [
        'Andere Nummer als im Profil – dann erkennt die Cloud dich nicht und die Nachricht landet in der Vertriebs-Inbox.',
        '„erledigt“ ohne Nummer schicken – dann kommt nur eine kurze Hilfe zurück, abgehakt wird nichts.',
        'Vertrauliche Kundendaten diktieren, die nicht in eine Aufgabe gehören.',
      ],
      links: [L('Boards', '/boards'), L('Mein Profil', '/profile')],
    },
  },
  {
    slug: 'video-freigabe-schnitt', typ: 'sop', titel: 'Video-Freigabe für den Schnitt: hochladen, Feedback umsetzen, neue Version', modul: 'Arbeitsweise & Regeln', positionen: ['grundlagen', 'media_buyer', 'content'], status: 'freigegeben', prioritaet: 1, reihenfolge: 22,
    zusammenfassung: 'Jedes Ad, Website-Video und Reel geht vor der Veröffentlichung durch die Video-Freigabe – Feedback gibt es zeitgenau im Video, nicht per WhatsApp.',
    abschnitte: {
      zweck: 'Kein Video geht mit Rechtschreibfehlern oder ohne Freigabe raus, und jedes Feedback ist sekundengenau nachvollziehbar.',
      ausloeser: 'Ein Schnitt ist fertig (erste Version) oder Änderungen wurden umgesetzt (neue Version).',
      automatisch: [
        'Die KI liest nach dem Upload alle Texte im Video (Untertitel, Einblendungen, CTA) und markiert Fehler lila auf der Zeitleiste.',
        'Der Prüfer bekommt Push + Glocke, täglich ab 17 Uhr zusätzlich eine Sammelerinnerung.',
        'Neue Version → Status springt automatisch zurück auf „Zu prüfen“, die KI prüft erneut, alte Versionen bleiben nachlesbar.',
      ],
      schritte: [
        'Export: 1080p, H.264, so komprimiert, dass die Datei unter dem angezeigten Limit bleibt.',
        'Cloud → Video-Freigabe → „Video hochladen“: Titel (Kunde – Art – Inhalt), Kunde, Art, Prüfer (Standard: Felix), Fälligkeit, Datei. Fenster offen lassen, bis der Fortschrittsbalken durch ist.',
        'Wenn das Video „Änderungen nötig“ hat: Video öffnen, Kommentare von oben nach unten durchgehen. Klick auf die Zeit springt an die Stelle. Rot = Team, Orange = Kunde, Lila = KI.',
        'Für den Schnitt: „Marker“ → Resolve (.edl) oder Premiere (.xml) herunterladen und importieren – dann stehen alle Kommentare mit Zeitangabe der gewählten Version als Marker in deiner Timeline (standardmäßig nur offene; allgemeine Kommentare stehen in der CSV-Liste).',
        'Jeden umgesetzten Kommentar auf „erledigt“ setzen. Unklar? Antwort als neuen Kommentar an dieselbe Stelle schreiben.',
        '„Neue Version“ hochladen – sie geht automatisch wieder an den Prüfer. Der Kunde sieht sie erst, wenn der Prüfer sie freigegeben hat.',
        'Mit „Versionen vergleichen“ prüfst du vorher selbst: alte und neue Version laufen synchron nebeneinander.',
      ],
      checkliste: ['Titel nach Schema „Kunde – Art – Inhalt“', 'Prüfer und Fälligkeit gesetzt', 'KI-Hinweise geprüft und Fehler korrigiert', 'Alle Kommentare der letzten Runde erledigt', 'Neue Version statt neues Video hochgeladen'],
      review: ['Kein offener Kommentar beim Hochladen der neuen Version', 'Keine KI-Rechtschreibhinweise offen'],
      fehler: [
        'Ein „neues Video“ statt einer „neuen Version“ anlegen – dann geht der Verlauf verloren.',
        'Feedback per WhatsApp annehmen und nicht in der Video-Freigabe vermerken.',
        'Kommentare nicht abhaken – der Prüfer sieht dann nicht, was umgesetzt ist.',
      ],
      links: [L('Video-Freigabe', '/videos')],
    },
  },
  {
    slug: 'video-freigabe-pruefen', typ: 'sop', titel: 'Videos prüfen und freigeben (Prüfer)', modul: 'Arbeitsweise & Regeln', positionen: ['grundlagen', 'fuehrung'], status: 'freigegeben', prioritaet: 1, reihenfolge: 23,
    zusammenfassung: 'Abends im Prüf-Modus alle Videos durchgehen: zeitgenau kommentieren, Änderungen anfordern oder freigeben.',
    abschnitte: {
      zweck: 'Schnelles, präzises Feedback – der Cutter weiß genau, was an welcher Stelle zu tun ist.',
      ausloeser: 'Benachrichtigung „bereit zur Prüfung“ oder die Sammelerinnerung ab 17 Uhr.',
      automatisch: ['Nach „Freigeben“ oder „Änderungen anfordern“ springt die Cloud direkt zum nächsten Video, das auf dich wartet.', 'Der Bearbeiter wird automatisch informiert.'],
      schritte: [
        'Video-Freigabe → Reiter „Zu prüfen“ → erstes Video öffnen.',
        'Abspielen. Tastenkürzel: Leertaste = Play/Pause, K = Pause, L = Play (nochmal = schneller), J = 5 s zurück, ←/→ = ein Bild, ⇧+←/→ = eine Sekunde, F = Vollbild.',
        'Etwas fällt auf → Taste C (oder ins Kommentarfeld klicken): Video hält an, der Kommentar gilt für genau diese Stelle. Kurz und konkret schreiben, Strg/⌘ + Enter sendet.',
        'Betrifft es einen Abschnitt (z. B. „Musik von 0:12 bis 0:18 leiser“): an den Anfang springen und I drücken, an das Ende und O drücken – dann kommentieren. Der Bereich erscheint als Balken auf der Zeitleiste.',
        'Allgemeines (Farben, Tempo, Musik insgesamt) → Häkchen „bei …“ abwählen = allgemeiner Kommentar.',
        'Lila KI-Hinweise prüfen: echter Fehler → offen lassen; Fehlalarm → „erledigt“.',
        'Bei neuen Versionen: „Versionen vergleichen“ – vorher/nachher synchron nebeneinander.',
        'Entscheiden: „Änderungen anfordern“ (mindestens ein offener Kommentar) oder „Freigeben“.',
      ],
      checkliste: ['Ganzes Video einmal komplett angesehen', 'Jeder Punkt als Kommentar an der richtigen Stelle', 'KI-Hinweise bewertet', 'Entscheidung getroffen (nicht liegen lassen)'],
      review: ['Kein Video länger als 24 Stunden in „Zu prüfen“', 'Kommentare sind ohne Rückfrage umsetzbar'],
      fehler: ['Feedback als ein langer Text statt einzelner Kommentare an den Stellen.', 'Freigeben, obwohl noch Kommentare offen sind (die Cloud fragt nach).'],
      links: [L('Video-Freigabe', '/videos')],
    },
  },
  {
    slug: 'video-kunden-freigabe', typ: 'sop', titel: 'Kunden-Freigabe: Video per Link vom Kunden abnehmen lassen', modul: 'Arbeitsweise & Regeln', positionen: ['grundlagen', 'csm'], status: 'freigegeben', prioritaet: 1, reihenfolge: 24,
    zusammenfassung: 'Der Kunde bekommt einen Link ohne Login, kommentiert direkt im Video und gibt frei – kein Hin und Her per WhatsApp oder E-Mail.',
    abschnitte: {
      zweck: 'Kundenfeedback kommt strukturiert und zeitgenau an, und die Freigabe ist dokumentiert.',
      ausloeser: 'Das Video ist intern freigegeben (oder der Kunde soll früh mitreden).',
      automatisch: [
        'Der Kunde sieht nur die Version, die ihr intern freigegeben habt. Gibt der Prüfer eine neue Version frei, bekommt der Kunde sie automatisch unter demselben Link, und der Kundenstatus steht wieder auf „offen“.',
        'Der Kunde kann je Version genau einmal entscheiden.',
        'Kundenkommentare erscheinen orange in der Cloud; Bearbeiter und Prüfer bekommen eine Benachrichtigung (höchstens eine pro 10 Minuten).',
        'Wünscht der Kunde Änderungen, springt das Video automatisch auf „Änderungen nötig“ beim Bearbeiter.',
        'Interne Kommentare (Team, KI) sieht der Kunde nie.',
      ],
      schritte: [
        'Prüfer oder Admin: Video öffnen → „Kunden-Link“ → „Link erstellen“ (wird automatisch kopiert). Andere Mitarbeiter sehen den Link dort zum Kopieren, sobald er existiert.',
        'Link per WhatsApp an den Kunden: „Hier ist dein Video zur Freigabe. Halte einfach an der Stelle an, die du ändern möchtest, und schreib es dazu – oder klick oben auf Freigeben.“',
        'Kunde kommentiert mit seinem Namen und klickt „Freigeben“ oder „Änderungen gewünscht“. Du siehst den Status oben im Video und in der Liste („Kunde: ✓ / Änderungen / offen“).',
        'Änderungen gewünscht → Video steht beim Cutter auf „Änderungen nötig“ → neue Version → Prüfer gibt frei → Kunde sieht sie unter demselben Link. Kurze Nachricht an den Kunden: „Neue Version ist drin, gleicher Link.“',
        'Soll der Kunde eine Version schon vor der internen Freigabe sehen: „Kunden-Link“ → „Version X an Kunden geben“.',
        'Nach der Freigabe: Link über „Kunden-Link“ → „Link deaktivieren“ schließen, wenn der Kunde nicht mehr zugreifen soll.',
      ],
      checkliste: ['Video intern freigegeben, bevor der Kunde es sieht', 'Link mit kurzer Anleitung verschickt', 'Kundenstatus geprüft', 'Nach Abschluss Link deaktiviert'],
      review: ['Freigabe des Kunden liegt in der Cloud vor, bevor das Video live geht'],
      fehler: ['Video als Datei per WhatsApp schicken – dann fehlt die Dokumentation.', 'Kundenfeedback aus dem Telefonat nicht als Kommentar nachtragen.'],
      links: [L('Video-Freigabe', '/videos')],
    },
  },
];

export const ARTIKEL_A_Z: ArtikelDef[] = [...KULTUR, ...ARBEITSWEISE, ...BOARDS_VIDEOS, ...INNENDIENST, ...SETTING, ...CLOSING, ...KUNDENBETREUUNG, ...MARKETING, ...VERWALTUNG];
