/**
 * Positionen der Team-Akademie. Jede Position bündelt Rollenbeschreibung, Skripte, Wissen und SOPs.
 * `funktionen` = users.funktion, für die die Position standardmäßig freigeschaltet ist.
 * „grundlagen“ bekommt jeder interne Mitarbeiter.
 */

export interface Position {
  id: string;
  label: string;
  beschreibung: string;
  funktionen: string[];
}

export const POSITIONEN: Position[] = [
  { id: 'grundlagen', label: 'Grundlagen & Cloud', beschreibung: 'Wie die Zoepp Cloud aufgebaut ist und wie du deine Aufgaben findest – für alle.', funktionen: [] },
  { id: 'setting', label: 'Setting', beschreibung: 'Erstgespräche, Terminierung und Setting-Follow-ups.', funktionen: ['setter', 'vertrieb'] },
  { id: 'closing', label: 'Closing', beschreibung: 'Abschlussgespräche, Angebote, CC2 und Einwandbehandlung.', funktionen: ['closer', 'vertrieb'] },
  { id: 'vertriebsleitung', label: 'Vertriebsleitung', beschreibung: 'Sales-Controlling, Team-Auslastung und Close-Pflege.', funktionen: ['vertrieb'] },
  { id: 'csm', label: 'Kundenbetreuung', beschreibung: 'Abschluss bis Onboarding, Kick-off-Call, laufende Betreuung, Verlängerung.', funktionen: ['csm'] },
  { id: 'innendienst', label: 'Innendienst', beschreibung: 'Bewerber in den Kunden-Clouds bearbeiten, anrufen, terminieren.', funktionen: ['innendienst', 'csm'] },
  { id: 'media_buyer', label: 'Ads & Funnel', beschreibung: 'Anzeigen, Grafiken, Funnel, Tracking, Meta-Kampagnen und Indeed.', funktionen: ['media_buyer'] },
  { id: 'content', label: 'Content', beschreibung: 'Video-Skripte, Copys und Content für Kunden und eigene Kanäle.', funktionen: ['content', 'media_buyer'] },
  { id: 'backoffice', label: 'Buchhaltung', beschreibung: 'Rechnungen in Lexware, Zahlungsabgleich, Mahnwesen.', funktionen: ['backoffice'] },
  { id: 'ops', label: 'Operations', beschreibung: 'Abläufe, Systeme und Qualität im Hintergrund.', funktionen: ['ops'] },
  { id: 'fuehrung', label: 'Führung', beschreibung: 'Steuerung, Kennzahlen, Freigaben – für Admins.', funktionen: [] },
];

export const POSITION_LABEL: Record<string, string> = Object.fromEntries(POSITIONEN.map((p) => [p.id, p.label]));

export function istPosition(v: unknown): v is string {
  return typeof v === 'string' && POSITIONEN.some((p) => p.id === v);
}

/** Vorschlag: welche Positionen ein Mitarbeiter mit dieser Funktion standardmäßig sieht */
export function vorschlagFuer(funktion: string | null | undefined): string[] {
  const f = funktion ?? '';
  return ['grundlagen', ...POSITIONEN.filter((p) => p.funktionen.includes(f)).map((p) => p.id)];
}
