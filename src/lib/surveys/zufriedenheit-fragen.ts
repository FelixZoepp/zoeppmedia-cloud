/**
 * Fragen des 2-Wochen-Checks (Vorlage „Kundenzufriedenheit (2-Wochen-Check)“).
 * Aufbau nach Selbstüberzeugung, ohne zu manipulieren:
 *  1. Erst Erfolge und Zahlen benennen lassen (der Kunde formuliert selbst, was gut läuft)
 *  2. Dann bewerten – mit dem Erfolg im Kopf, aber neutral gefragt (1–5, alle Stufen gleich angeboten)
 *  3. Vorher/Nachher in eigenen Worten (Kontrast + Material für Kundenstimmen)
 *  4. Blick nach vorn (Ziel 30 Tage, weitere Zusammenarbeit) – ehrliche Ausstiegs-Optionen sind dabei
 *  5. Offene Kritik ausdrücklich erwünscht, Weiterempfehlung, Freigabe als Kundenstimme
 * IDs overall, roi, weiter_zusammenarbeit, mehr_bewerber, nps werden in planung.ts (folgenAusAntwort) ausgewertet.
 */
import type { Frage } from './planung';

export const ZUFRIEDENHEIT_TITEL = 'Kundenzufriedenheit (2-Wochen-Check)';
export const ZUFRIEDENHEIT_BESCHREIBUNG =
  'Dauert 2 Minuten. Deine Antworten helfen uns, genau dort nachzuschärfen, wo es dir am meisten bringt.';

export const ZUFRIEDENHEIT_FRAGEN: Frage[] = [
  { id: 'erfolg_highlight', type: 'text', label: 'Was hat in den letzten 14 Tagen beim Recruiting am besten funktioniert?' },
  {
    id: 'einstellungen_14',
    type: 'choice',
    label: 'Wie viele neue Vertriebler hast du in den letzten 14 Tagen eingestellt oder fest eingeplant?',
    options: ['Keinen', '1', '2–3', '4 oder mehr'],
  },
  { id: 'overall', type: 'rating', label: 'Wie zufrieden bist du insgesamt mit der Zusammenarbeit?' },
  { id: 'bewerber_qualitaet', type: 'rating', label: 'Wie bewertest du die Qualität der Bewerber?' },
  { id: 'kommunikation', type: 'rating', label: 'Wie zufrieden bist du mit Kommunikation und Erreichbarkeit?' },
  { id: 'roi', type: 'choice', label: 'Lohnt sich die Investition für dich bisher?', options: ['Ja, klar', 'Auf einem guten Weg', 'Eher nein'] },
  { id: 'vorher_nachher', type: 'text', label: 'Wie lief dein Recruiting, bevor wir zusammengearbeitet haben – und was ist heute anders?' },
  { id: 'ziel_30', type: 'text', label: 'Was willst du in den nächsten 30 Tagen beim Recruiting erreichen?' },
  {
    id: 'mehr_bewerber',
    type: 'choice',
    label: 'Könntest du aktuell mehr gute Bewerber aufnehmen?',
    options: ['Ja, locker', 'Vielleicht 1-2 mehr', 'Nein, passt so', 'Eher weniger'],
  },
  {
    id: 'weiter_zusammenarbeit',
    type: 'choice',
    label: 'Wie siehst du die nächsten Monate mit uns?',
    options: ['Auf jeden Fall weiter', 'Weiter, mit ein paar Anpassungen', 'Unsicher', 'Eher nicht'],
  },
  { id: 'verbessern', type: 'text', label: 'Was können wir noch besser machen? Sei gern ehrlich – genau das hilft uns.' },
  { id: 'nps', type: 'nps', label: 'Wie wahrscheinlich ist es, dass du uns einem befreundeten Unternehmer empfiehlst? (0–10)' },
  {
    id: 'testimonial_ok',
    type: 'choice',
    label: 'Dürfen wir deine Antworten zu „was am besten funktioniert“ und „vorher/heute“ als Kundenstimme verwenden?',
    options: ['Ja, mit Namen', 'Ja, anonym', 'Nein'],
  },
];
