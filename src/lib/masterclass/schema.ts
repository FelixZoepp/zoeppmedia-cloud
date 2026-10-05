import type { SupabaseClient } from '@supabase/supabase-js';

let cache: { ready: boolean; at: number } | null = null;

/** Ist die Migration 20261005000001 (neue Lektionsfelder) eingespielt? Ergebnis 60 s gecacht. */
export async function lessonSchemaReady(svc: SupabaseClient): Promise<boolean> {
  if (cache && Date.now() - cache.at < 60_000) return cache.ready;
  const { error } = await svc.from('masterclass_lessons').select('status, kapitel, anhaenge').limit(1);
  const ready = !error;
  cache = { ready, at: Date.now() };
  return ready;
}
