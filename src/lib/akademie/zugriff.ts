/**
 * Freischaltung der Akademie: Admins sehen alles (auch Entwürfe). Mitarbeiter sehen nur freigegebene
 * Artikel ihrer freigeschalteten Positionen – Vorschlag aus users.funktion, überschrieben durch
 * akademie_freigaben (Position an/aus) und akademie_artikel_freigaben (einzelner Artikel an/aus).
 * Wird in jeder API-Route, in der Suche und im Bot-Kontext serverseitig angewendet.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { vorschlagFuer } from './positionen';

export interface AkademieNutzer {
  id: string;
  role: string;
  funktion?: string | null;
}

export interface Zugriff {
  admin: boolean;
  positionen: Set<string>;
  artikelAn: Set<string>;
  artikelAus: Set<string>;
}

export interface SichtbarkeitsFelder {
  slug: string;
  status: string;
  positionen: string[];
}

export function istIntern(role: string): boolean {
  return role === 'admin' || role === 'employee';
}

/** Freischaltung aus Vorschlag + gespeicherten Schaltern berechnen (rein, testbar) */
export function berechneZugriff(
  nutzer: AkademieNutzer,
  positionsSchalter: Array<{ position: string; an: boolean }>,
  artikelSchalter: Array<{ slug: string; an: boolean }>,
): Zugriff {
  if (nutzer.role === 'admin') return { admin: true, positionen: new Set(), artikelAn: new Set(), artikelAus: new Set() };
  const positionen = new Set(istIntern(nutzer.role) ? vorschlagFuer(nutzer.funktion) : []);
  for (const s of positionsSchalter) {
    if (s.an) positionen.add(s.position);
    else positionen.delete(s.position);
  }
  return {
    admin: false,
    positionen: istIntern(nutzer.role) ? positionen : new Set(),
    artikelAn: new Set(istIntern(nutzer.role) ? artikelSchalter.filter((a) => a.an).map((a) => a.slug) : []),
    artikelAus: new Set(artikelSchalter.filter((a) => !a.an).map((a) => a.slug)),
  };
}

export async function ladeZugriff(svc: SupabaseClient, nutzer: AkademieNutzer): Promise<Zugriff> {
  if (nutzer.role === 'admin') return berechneZugriff(nutzer, [], []);
  if (!istIntern(nutzer.role)) return { admin: false, positionen: new Set(), artikelAn: new Set(), artikelAus: new Set() };
  const [{ data: pos }, { data: art }] = await Promise.all([
    svc.from('akademie_freigaben').select('position, an').eq('user_id', nutzer.id),
    svc.from('akademie_artikel_freigaben').select('slug, an').eq('user_id', nutzer.id),
  ]);
  return berechneZugriff(
    nutzer,
    (pos ?? []) as Array<{ position: string; an: boolean }>,
    (art ?? []) as Array<{ slug: string; an: boolean }>,
  );
}

/** Darf dieser Nutzer den Artikel sehen? Entwürfe nur Admins. */
export function darfSehen(a: SichtbarkeitsFelder, z: Zugriff): boolean {
  if (z.admin) return true;
  if (a.status !== 'freigegeben') return false;
  if (z.artikelAus.has(a.slug)) return false;
  if (z.artikelAn.has(a.slug)) return true;
  return a.positionen.some((p) => z.positionen.has(p));
}
