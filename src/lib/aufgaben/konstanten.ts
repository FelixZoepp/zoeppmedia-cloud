/** Konstanten der Aufgaben-Boards – auch im Browser nutzbar */

export const AUFGABEN_STATUS = ['todo', 'in_progress', 'review', 'done'] as const;
export type AufgabenStatus = (typeof AUFGABEN_STATUS)[number];
export const STATUS_LABEL: Record<AufgabenStatus, string> = { todo: 'Offen', in_progress: 'In Arbeit', review: 'Prüfung', done: 'Erledigt' };
export const PRIORITAETEN = ['low', 'medium', 'high', 'urgent'] as const;
export type Prioritaet = (typeof PRIORITAETEN)[number];
export const PRIO_LABEL: Record<Prioritaet, string> = { low: 'Niedrig', medium: 'Normal', high: 'Hoch', urgent: 'Dringend' };

