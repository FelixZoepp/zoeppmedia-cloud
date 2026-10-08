import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Schalter „Automatik (neue Fulfillment-Strecke)“ – agencies.automatik.
 * Alle automatischen Teile der neuen Strecke laufen nur für Kunden mit automatik = true;
 * Bestandskunden verhalten sich wie vor dem Bau. Knöpfe (bewusste Handlung) sind davon nicht betroffen.
 * Fehlt die Spalte (Migration noch nicht eingespielt) oder schlägt die Abfrage fehl, gilt: aus.
 */
export async function istAutomatikKunde(svc: SupabaseClient, agencyId: string): Promise<boolean> {
  const { data, error } = await svc.from('agencies').select('automatik').eq('id', agencyId).maybeSingle();
  if (error) return false;
  return (data as { automatik?: boolean } | null)?.automatik === true;
}

/** IDs aller Automatik-Kunden – für Massenläufe (Cron/Tick). Bei Fehler: leere Liste. */
export async function automatikAgencyIds(svc: SupabaseClient): Promise<string[]> {
  const { data, error } = await svc.from('agencies').select('id').eq('automatik', true);
  if (error) return [];
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}
