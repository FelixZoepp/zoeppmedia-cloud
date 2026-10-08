'use client';

/**
 * Verbindung zwischen Aufgaben (Meine To-dos, Kunden-Ablauf) und der Hilfe-Leiste:
 * - setzeHilfeKontext: Aufgabe geöffnet/fokussiert → passende SOP an der Seite zeigen
 * - vorErledigen: vor „Erledigt“ die Checkliste prüfen (nicht blockierend, „trotzdem erledigen“ möglich)
 */

import { hatSop } from '@/lib/akademie/schritt-index';
import { vorgangVon } from '@/lib/akademie/hilfe-zuordnung';

export interface HilfeKontext {
  stepKey?: string | null;
  stepId?: string | null;
  titel?: string | null;
}

export const HILFE_KONTEXT_EVENT = 'zmc-hilfe-kontext';
export const HILFE_ERLEDIGEN_EVENT = 'zmc-hilfe-erledigen';

export interface ErledigenAnfrage {
  stepKey: string;
  kontext: string;
  resolve: (weiter: boolean) => void;
}

declare global {
  interface Window {
    __zmcHilfeAktiv?: boolean;
  }
}

export function setzeHilfeKontext(k: HilfeKontext): void {
  if (typeof window === 'undefined' || !k.stepKey || !hatSop(k.stepKey)) return;
  window.dispatchEvent(new CustomEvent<HilfeKontext>(HILFE_KONTEXT_EVENT, { detail: k }));
}

/** true = weiter erledigen, false = abbrechen (Nutzer will die Checkliste erst abarbeiten) */
export function vorErledigen(opts: { stepKey: string | null | undefined; stepId: string | null | undefined }): Promise<boolean> {
  if (typeof window === 'undefined' || !opts.stepKey || !hatSop(opts.stepKey) || !window.__zmcHilfeAktiv) return Promise.resolve(true);
  const stepKey = opts.stepKey;
  return new Promise((resolve) => {
    const detail: ErledigenAnfrage = { stepKey, kontext: vorgangVon({ stepId: opts.stepId }), resolve };
    window.dispatchEvent(new CustomEvent<ErledigenAnfrage>(HILFE_ERLEDIGEN_EVENT, { detail }));
  });
}
