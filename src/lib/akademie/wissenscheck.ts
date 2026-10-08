/**
 * Wissenscheck am Ende jeder Bereichs-Akademie (Multiple Choice). Fragen stammen aus den Inhalten
 * der Akademie. Ausgewertet wird serverseitig – der Client bekommt die Lösungen nie.
 */

import { STANDARD_SCHWELLEN as S } from '@/lib/sales-controlling/auslastung';

export interface Frage {
  id: string;
  frage: string;
  optionen: string[];
  richtig: number;
}

export const BESTEHEN_AB = 0.8;

export const WISSENSCHECKS: Record<string, Frage[]> = {
  grundlagen: [
    { id: 'g1', frage: 'Du verlässt kurz deinen Platz. Was tust du?', optionen: ['Nichts, ist ja nur kurz', 'Bildschirm sperren', 'Browser schließen'], richtig: 1 },
    { id: 'g2', frage: 'Wo gehören Aufgaben und Absprachen hin?', optionen: ['In den Team-Chat', 'In die Cloud (Aufgabe bzw. Kommentar)', 'In mein Notizbuch'], richtig: 1 },
    { id: 'g3', frage: 'Ein Kunde ist verärgert und droht mit Kündigung. Was ist richtig?', optionen: ['Rabatt anbieten, um ihn zu beruhigen', 'Zuhören, zusammenfassen und an Kundenbetreuung/Felix eskalieren', 'Per WhatsApp kurz antworten'], richtig: 1 },
    { id: 'g4', frage: 'Darfst du einen Lebenslauf über dein privates WhatsApp weiterleiten?', optionen: ['Ja, wenn es schnell gehen muss', 'Nein, nur über die freigegebenen Tools', 'Ja, an den Kunden'], richtig: 1 },
    { id: 'g5', frage: 'Was enthält eine gute Übergabe?', optionen: ['Nur den Namen des Kunden', 'Stand, nächsten Schritt, Frist und wo die Infos liegen', 'Einen Link zum Chat'], richtig: 1 },
  ],
  innendienst: [
    { id: 'i1', frage: 'Wann plant die Kadenz den ersten Anruf bei einem neuen Bewerber?', optionen: ['Nach 15 Minuten', 'Am nächsten Tag', 'Nach 3 Stunden'], richtig: 0 },
    { id: 'i2', frage: 'Wie viele Anrufversuche macht die Kadenz höchstens?', optionen: ['3', '6', '10'], richtig: 1 },
    { id: 'i3', frage: 'Was liest du vor jedem Anruf?', optionen: ['Nichts, ich rufe direkt an', 'Profil, Quelle und WhatsApp-Verlauf', 'Nur den Namen'], richtig: 1 },
    { id: 'i4', frage: 'Ein Bewerber sagt „Bitte nicht mehr anrufen“. Was tust du?', optionen: ['In einer Woche noch einmal versuchen', 'Opt-out in der Cloud setzen und freundlich bestätigen', 'Nichts eintragen'], richtig: 1 },
    { id: 'i5', frage: 'Wann trägst du das Anruf-Ergebnis ein?', optionen: ['Sofort nach dem Anruf', 'Am Ende des Tages', 'Nur wenn ein Termin entstanden ist'], richtig: 0 },
  ],
  setting: [
    { id: 's1', frage: 'Wie viele Setting-Follow-ups machst du mindestens pro Tag?', optionen: ['20', String(S.followupsMin), '100'], richtig: 1 },
    { id: 's2', frage: 'Wie viele gehaltene Settings pro Tag sind optimal?', optionen: [String(S.settingMin), String(S.settingOptimal), String(S.settingKapazitaet)], richtig: 1 },
    { id: 's3', frage: 'Wer setzt nach dem Setting den Status in Close?', optionen: ['Der Closer', 'Du selbst, sofort nach dem Gespräch', 'Die Cloud automatisch'], richtig: 1 },
    { id: 's4', frage: 'Ein Lead ist unentschlossen. Was tust du?', optionen: ['Status „Setting - Follow Up“ und Rhythmus-Feld setzen', 'Lead löschen', 'Nichts'], richtig: 0 },
  ],
  closing: [
    { id: 'c1', frage: 'Wie viele gehaltene Closings pro Tag sind die Mindestvorgabe?', optionen: ['3', String(S.closingMin), '12'], richtig: 1 },
    { id: 'c2', frage: 'Was startet nach „Gewonnen“ die Fulfillment-Strecke?', optionen: ['Eine Mail an Felix', 'Das After-Close-Formular in der Cloud', 'Die Rechnung in Lexware'], richtig: 1 },
    { id: 'c3', frage: 'Was gehört ins After-Close unbedingt hinein?', optionen: ['Nur der Firmenname', 'Paket, Preise, Laufzeit, Start und Garantieziel', 'Die Bankverbindung des Kunden'], richtig: 1 },
  ],
  csm: [
    { id: 'k1', frage: 'Was passiert bei Kunden mit Automatik nach der Zahlung der Setup-Rechnung?', optionen: ['Nichts', 'Das Onboarding startet automatisch', 'Die Kampagne geht live'], richtig: 1 },
    { id: 'k2', frage: 'Wann entstehen Verlängerungsaufgaben?', optionen: ['30 und 14 Tage vor Laufzeitende', 'Am letzten Tag', 'Gar nicht'], richtig: 0 },
    { id: 'k3', frage: 'Schlechte Nachrichten an Kunden überbringst du …', optionen: ['per WhatsApp', 'telefonisch', 'gar nicht'], richtig: 1 },
    { id: 'k4', frage: 'Die Garantie-Ampel ist rot. Was passiert?', optionen: ['Nichts', 'Es entsteht eine dringende Aufgabe für die Kundenbetreuung', 'Der Kunde wird automatisch gekündigt'], richtig: 1 },
  ],
  media_buyer: [
    { id: 'm1', frage: 'Welche Formate legst du für eine Bild-Ad an?', optionen: ['Nur 1:1', '1:1, 4:5 und 9:16', '16:9'], richtig: 1 },
    { id: 'm2', frage: 'Wie legt die Cloud neue Meta-Kampagnen an?', optionen: ['Aktiv mit Budget', 'Pausiert – gestartet wird per Knopf', 'Gar nicht'], richtig: 1 },
    { id: 'm3', frage: 'Was ist bei Stellenanzeigen auf Meta nicht erlaubt?', optionen: ['Region nennen', 'Nach Alter oder Geschlecht ansprechen', 'Verdienst nennen, wenn er belegt ist'], richtig: 1 },
    { id: 'm4', frage: 'Was muss nach dem automatischen Funnel-Bau noch von Hand geprüft werden?', optionen: ['Nichts', 'Pixel, Webhook und Test-Lead', 'Nur die Farbe'], richtig: 1 },
  ],
  content: [
    { id: 't1', frage: 'Wo steht der Hook in einem Video?', optionen: ['In den ersten 3 Sekunden', 'Am Ende', 'In der Mitte'], richtig: 0 },
    { id: 't2', frage: 'Warum brauchen Videos immer Untertitel?', optionen: ['Weil es schöner aussieht', 'Weil die meisten ohne Ton schauen', 'Weil Meta es verlangt'], richtig: 1 },
    { id: 't3', frage: 'Was ist der Startpunkt für Skripte und Ad-Texte?', optionen: ['Ein leeres Dokument', 'Der KI-Generator der Cloud', 'Texte der Konkurrenz'], richtig: 1 },
  ],
  backoffice: [
    { id: 'b1', frage: 'Wie erfährt die Cloud, dass eine Setup-Rechnung bezahlt ist?', optionen: ['Gar nicht', 'Über den Status in Lexware (Abgleich mit Qonto)', 'Per Mail vom Kunden'], richtig: 1 },
    { id: 'b2', frage: 'Was tust du, wenn die Cloud die Setup-Rechnung nicht findet?', optionen: ['Nichts', 'Rechnungsnummer im Kunden-Ablauf verknüpfen', 'Neue Rechnung schreiben'], richtig: 1 },
    { id: 'b3', frage: 'Wohin gehen überfällige Rechnungen?', optionen: ['Ins Mahnwesen', 'In den Papierkorb', 'An den Vertrieb'], richtig: 0 },
  ],
  ops: [
    { id: 'o1', frage: 'Wo siehst du, ob Perspective, WhatsApp und Meta verbunden sind?', optionen: ['Admin → Anbindung', 'In Close', 'Im Werbemanager'], richtig: 0 },
    { id: 'o2', frage: 'Wie lange darf ein Automatik-Fehler ohne Aufgabe bleiben?', optionen: ['Höchstens 24 Stunden', 'Eine Woche', 'Egal'], richtig: 0 },
    { id: 'o3', frage: 'Was sichtest du täglich in der Akademie?', optionen: ['Neue Wissenslücken', 'Die Videos', 'Nichts'], richtig: 0 },
  ],
  vertriebsleitung: [
    { id: 'v1', frage: 'Ab welchem Ø Settings pro Setter über 2 Wochen meldet die Cloud „neuer Setter nötig“?', optionen: ['10', String(S.settingVoll), '32'], richtig: 1 },
    { id: 'v2', frage: 'Ab welchem Ø Closings pro Closer meldet die Cloud „neuer Closer nötig“?', optionen: ['4', String(S.closingOptimal), '15'], richtig: 1 },
    { id: 'v3', frage: 'Wie coachst du Gespräche am einfachsten?', optionen: ['Gar nicht', 'Fireflies-Aufnahmen anhören und mit der Review-Checkliste besprechen', 'Nur Zahlen ansehen'], richtig: 1 },
  ],
  fuehrung: [
    { id: 'f1', frage: 'Wer sieht Entwürfe in der Akademie?', optionen: ['Alle Mitarbeiter', 'Nur Admins', 'Niemand'], richtig: 1 },
    { id: 'f2', frage: 'Wo entsteht eine Wissenslücke?', optionen: ['Wenn der Akademie-Bot keine Antwort findet', 'Wenn ein Video fehlt', 'Wenn ein Kunde kündigt'], richtig: 0 },
    { id: 'f3', frage: 'Bei welchen Kunden läuft die neue Fulfillment-Automatik?', optionen: ['Bei allen', 'Nur bei Kunden mit eingeschalteter Automatik', 'Bei keinem'], richtig: 1 },
  ],
};

/** Fragen ohne Lösung (für den Client) */
export function fragenOhneLoesung(bereich: string): Array<Omit<Frage, 'richtig'>> {
  return (WISSENSCHECKS[bereich] ?? []).map(({ id, frage, optionen }) => ({ id, frage, optionen }));
}

export interface Auswertung {
  richtig: number;
  gesamt: number;
  bestanden: boolean;
  falsch: string[];
}

/** Antworten (Fragen-ID → Index der Option) auswerten */
export function werteAus(bereich: string, antworten: Record<string, number>): Auswertung {
  const fragen = WISSENSCHECKS[bereich] ?? [];
  const falsch = fragen.filter((f) => antworten[f.id] !== f.richtig).map((f) => f.id);
  const richtig = fragen.length - falsch.length;
  return { richtig, gesamt: fragen.length, bestanden: fragen.length > 0 && richtig / fragen.length >= BESTEHEN_AB, falsch };
}
