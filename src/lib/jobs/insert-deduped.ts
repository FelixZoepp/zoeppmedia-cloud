import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

/**
 * Fügt Zeilen mit dedupe_key einzeln ein.
 * Die Dedupe-Indizes (scheduled_jobs, automation_runs) sind partiell (WHERE dedupe_key IS NOT NULL),
 * daher scheitert `upsert(..., { onConflict: 'dedupe_key' })` via PostgREST mit 42P10.
 * 23505 heißt "existiert schon" und ist kein Fehler.
 * Andere Fehler werden geloggt und als `error` zurückgegeben (erster Fehler).
 */
export async function insertDeduped(
  svc: SupabaseClient,
  table: 'scheduled_jobs' | 'automation_runs',
  rows: Row | Row[],
): Promise<{ inserted: number; duplicates: number; error: PostgrestError | null }> {
  let inserted = 0;
  let duplicates = 0;
  let firstError: PostgrestError | null = null;

  for (const row of Array.isArray(rows) ? rows : [rows]) {
    const { error } = await svc.from(table).insert(row);
    if (!error) {
      inserted++;
    } else if (error.code === '23505') {
      duplicates++;
    } else {
      console.error(`${table}: Einfügen fehlgeschlagen`, row.dedupe_key ?? '', error);
      firstError ??= error;
    }
  }

  return { inserted, duplicates, error: firstError };
}
