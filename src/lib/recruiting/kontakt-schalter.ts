/**
 * Zentraler Schalter „Bewerber-Kontakt“: Solange er aus ist, schreibt die Cloud KEINEN Bewerber automatisch an
 * (WhatsApp-Bot, Vorlagen, Erinnerungen, Automationen, Opt-in-Ersatzmail). Ausnahme: Testnummern/-adressen,
 * damit der komplette Ablauf mit eigenen Accounts getestet werden kann. Zusätzlich lässt sich der Kontakt
 * pro Kunde freigeben (kunden = Agentur-IDs), solange der globale Schalter aus ist. Manuelle Nachrichten aus der
 * Oberfläche und die Sales-Kommunikation sind nicht betroffen.
 * Einstellung: system_einstellungen.bewerber_kontakt = { aktiv: boolean, testnummern: string[], testmails: string[], kunden: string[] }
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const KONTAKT_KEY = 'bewerber_kontakt';

export interface KontaktSchalter {
  aktiv: boolean;
  testnummern: string[];
  testmails: string[];
  /** Agentur-IDs, für die der Bewerber-Kontakt einzeln freigegeben ist */
  kunden: string[];
}

export interface KontaktZiel {
  telefon?: string | null;
  email?: string | null;
  /** Agentur des Bewerbers – freigegeben, wenn sie in `kunden` steht */
  agencyId?: string | null;
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
    kunden: Array.isArray(o.kunden) ? [...new Set(o.kunden.filter((x): x is string => typeof x === 'string' && x.length > 0))] : [],
  };
}

export async function ladeSchalter(svc: SupabaseClient): Promise<KontaktSchalter> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', KONTAKT_KEY).maybeSingle();
  return liesSchalter((data as { wert: unknown } | null)?.wert);
}

/** Darf diese Nummer/Adresse automatisch kontaktiert werden? (rein, testbar) */
export function darfKontakt(s: KontaktSchalter, ziel: KontaktZiel): boolean {
  if (s.aktiv) return true;
  if (ziel.agencyId && s.kunden.includes(ziel.agencyId)) return true;
  if (ziel.telefon && s.testnummern.some((t) => nurZiffern(t) === nurZiffern(ziel.telefon!))) return true;
  if (ziel.email && s.testmails.some((m) => m.trim().toLowerCase() === ziel.email!.trim().toLowerCase())) return true;
  return false;
}

/** Bewerber-Kontakt für einen Kunden an-/ausschalten (rein, testbar) */
export function setzeKunde(s: KontaktSchalter, agencyId: string, an: boolean): KontaktSchalter {
  const ohne = s.kunden.filter((k) => k !== agencyId);
  return { ...s, kunden: an ? [...ohne, agencyId] : ohne };
}

export async function pruefeKontakt(svc: SupabaseClient, ziel: KontaktZiel): Promise<void> {
  if (!darfKontakt(await ladeSchalter(svc), ziel)) throw new KontaktGesperrtError();
}
