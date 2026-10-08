/**
 * Hilfe-Modus: welche SOP gehört zur aktuellen Seite bzw. zur geöffneten Aufgabe?
 * Ablauf-Schritte über SCHRITT_SOP, Seiten über PFAD_SOP (erster passender Eintrag gewinnt,
 * deshalb spezifische Pfade zuerst). Rein, auch im Client nutzbar.
 */

import { SCHRITT_SOP } from './schritt-index';

export const PFAD_SOP: Array<{ muster: RegExp; slugs: string[] }> = [
  { muster: /^\/clients\/[^/]+\/ablauf/, slugs: ['kunden-ablauf', 'meine-aufgaben'] },
  { muster: /^\/clients\/[^/]+\/integrationen/, slugs: ['meta-zugaenge', 'indeed-zugang'] },
  { muster: /^\/clients\/[^/]+\/perspective/, slugs: ['funnel'] },
  { muster: /^\/clients\/[^/]+\/transkript/, slugs: ['kickoff'] },
  { muster: /^\/clients/, slugs: ['kunden-ablauf', 'cloud-rundgang'] },
  { muster: /^\/(meine-todos|heute|aufgaben|tasks)/, slugs: ['meine-aufgaben', 'arbeitsplatz-tagesstart'] },
  { muster: /^\/admin\/after-close/, slugs: ['after-close', 'closing-gespraech'] },
  { muster: /^\/admin\/vertrieb/, slugs: ['sales-controlling', 'vertriebsleitung-routine', 'setting-followups'] },
  { muster: /^\/admin\/umsatz/, slugs: ['umsatz-analyse'] },
  { muster: /^\/(admin\/finanzen|admin\/buchhaltung|buchhaltung)/, slugs: ['buchhaltung-monat', 'setup-rechnung', 'mahnwesen'] },
  { muster: /^\/admin\/(anbindung|health)/, slugs: ['ops-systemcheck'] },
  { muster: /^\/admin\/marketing/, slugs: ['continuity-check'] },
  { muster: /^\/ads/, slugs: ['ads-werkstatt', 'creatives-erstellen', 'freigabe-prozess', 'skripte-schreiben'] },
  { muster: /^\/funnels/, slugs: ['funnel'] },
  { muster: /^\/innendienst/, slugs: ['innendienst', 'innendienst-anruf'] },
  { muster: /^\/(dialer|anrufen)/, slugs: ['innendienst-anruf', 'dialer', 'innendienst-nicht-erreicht'] },
  { muster: /^\/inbox/, slugs: ['whatsapp-inbox', 'kundenkommunikation'] },
  { muster: /^\/candidates/, slugs: ['innendienst-anruf', 'innendienst'] },
  { muster: /^\/(termine|kalender)/, slugs: ['termine'] },
  { muster: /^\/(akademie|hilfe)/, slugs: ['ki-assistent', 'cloud-rundgang'] },
];

/** SOPs zur Seite (leer = keine Zuordnung) */
export function sopsFuerPfad(pfad: string): string[] {
  return PFAD_SOP.find((e) => e.muster.test(pfad))?.slugs ?? [];
}

/** SOP zum Ablauf-Schritt */
export function sopFuerSchritt(stepKey: string | null | undefined): string | null {
  return stepKey ? SCHRITT_SOP[stepKey] ?? null : null;
}

/** Aufgabe zuerst, dann Seite – ohne Doppelte */
export function hilfeSlugs(opts: { pfad?: string | null; stepKey?: string | null }): string[] {
  const liste = [sopFuerSchritt(opts.stepKey), ...sopsFuerPfad(opts.pfad ?? '')].filter((s): s is string => !!s);
  return [...new Set(liste)];
}

/** Pfad ohne IDs – für Wissenslücken und als Vorgangs-Schlüssel ohne Kunde */
export function pfadMuster(pfad: string): string {
  return pfad.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[id]').replace(/\/\d+(?=\/|$)/g, '/[id]');
}

/**
 * Vorgang, an den eine Checkliste gebunden ist: Aufgabe (step:<id>) oder Seite inkl. Kunde.
 * So startet die Checkliste je Kunde/Vorgang neu.
 */
export function vorgangVon(opts: { stepId?: string | null; pfad?: string | null }): string {
  if (opts.stepId) return `step:${opts.stepId}`;
  return `pfad:${opts.pfad ?? ''}`;
}
