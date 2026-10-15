/**
 * Zwei Masterclasses: „ceo“ (Inhaber, Fortschritt je Kunde) und „fuehrung“ (Führungskräfte des Kunden,
 * Zugriff nur mit Freischaltung je Person, Fortschritt je Person). Bis die Migration 20261015000440
 * eingespielt ist, gibt es nur „ceo“.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type Bereich = 'ceo' | 'fuehrung';

let cache: { ready: boolean; at: number } | null = null;

/** Ist die Migration (Bereich + Freischaltungen) eingespielt? 60 s gecacht. */
export async function fuehrungSchemaReady(svc: SupabaseClient): Promise<boolean> {
  if (cache && Date.now() - cache.at < 60_000) return cache.ready;
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    svc.from('masterclass_modules').select('bereich').limit(1),
    svc.from('masterclass_freischaltungen').select('user_id').limit(1),
  ]);
  const ready = !e1 && !e2;
  cache = { ready, at: Date.now() };
  return ready;
}

/** Bereich eines Moduls (fehlt die Spalte: ceo) – rein, testbar */
export function bereichVon(mod: { bereich?: unknown } | null | undefined): Bereich {
  return mod?.bereich === 'fuehrung' ? 'fuehrung' : 'ceo';
}

/** Darf diese Person die Führungskräfte-Masterclass sehen? Admins immer (Vorschau). */
export async function hatFuehrungsZugang(svc: SupabaseClient, user: { id: string; role: string }): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (!(await fuehrungSchemaReady(svc))) return false;
  const { data } = await svc.from('masterclass_freischaltungen').select('user_id').eq('user_id', user.id).maybeSingle();
  return !!data;
}

/** Veröffentlichte Lektionen der CEO-Masterclass zählen (für Fortschritt in Fahrplan/Empfehlungen) */
export async function zaehleCeoLektionen(svc: SupabaseClient): Promise<number> {
  const [{ data: mods }, { data: lessons }] = await Promise.all([
    svc.from('masterclass_modules').select('*').eq('published', true),
    svc.from('masterclass_lessons').select('*'),
  ]);
  const ceo = new Set(((mods ?? []) as Array<{ id: string; bereich?: unknown }>).filter((m) => bereichVon(m) === 'ceo').map((m) => m.id));
  return ((lessons ?? []) as Array<{ module_id: string; status?: string }>).filter((l) => ceo.has(l.module_id) && l.status !== 'entwurf').length;
}
