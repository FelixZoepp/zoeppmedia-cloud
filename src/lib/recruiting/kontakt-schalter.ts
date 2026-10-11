/**
 * Zentraler Schalter „Bewerber-Kontakt“: Solange er aus ist, schreibt die Cloud KEINEN Bewerber automatisch an
 * (WhatsApp-Bot, Vorlagen, Erinnerungen, Automationen, Opt-in-Ersatzmail). Ausnahme: Testnummern/-adressen,
 * damit der komplette Ablauf mit eigenen Accounts getestet werden kann. Manuelle Nachrichten aus der
 * Oberfläche und die Sales-Kommunikation sind nicht betroffen.
 * Einstellung: system_einstellungen.bewerber_kontakt = { aktiv: boolean, testnummern: string[], testmails: string[] }
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const KONTAKT_KEY = 'bewerber_kontakt';

export interface KontaktSchalter {
  aktiv: boolean;
  testnummern: string[];
  testmails: string[];
}

export class KontaktGesperrtError extends Error {
  constructor(message = 'Bewerber-Kontakt ist noch nicht freigegeben (Admin → Bewerber-Kontakt)') {
    super(message);
    this.name = 'KontaktGesperrtError';
  }
}

const nurZiffern = (s: string) => s.replace(/\D/g, '').replace(/^00/, '').replace(/^0/, '49');

export function liesSchalter(wert: unknown): KontaktSchalter {
  let w = wert;
  if (typeof w === 'string') {
    try {
      w = JSON.parse(w);
    } catch {
      w = null;
    }
  }
  const o = (w ?? {}) as Partial<KontaktSchalter>;
  return {
    aktiv: o.aktiv === true,
    testnummern: Array.isArray(o.testnummern) ? o.testnummern.filter((x): x is string => typeof x === 'string') : [],
    testmails: Array.isArray(o.testmails) ? o.testmails.filter((x): x is string => typeof x === 'string') : [],
  };
}

export async function ladeSchalter(svc: SupabaseClient): Promise<KontaktSchalter> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', KONTAKT_KEY).maybeSingle();
  return liesSchalter((data as { wert: unknown } | null)?.wert);
}

/** Darf diese Nummer/Adresse automatisch kontaktiert werden? (rein, testbar) */
export function darfKontakt(s: KontaktSchalter, ziel: { telefon?: string | null; email?: string | null }): boolean {
  if (s.aktiv) return true;
  if (ziel.telefon && s.testnummern.some((t) => nurZiffern(t) === nurZiffern(ziel.telefon!))) return true;
  if (ziel.email && s.testmails.some((m) => m.trim().toLowerCase() === ziel.email!.trim().toLowerCase())) return true;
  return false;
}

export async function pruefeKontakt(svc: SupabaseClient, ziel: { telefon?: string | null; email?: string | null }): Promise<void> {
  if (!darfKontakt(await ladeSchalter(svc), ziel)) throw new KontaktGesperrtError();
}
