import type { SupabaseClient } from '@supabase/supabase-js';
import { darfAufgabeSehen } from './boards';

/** Aufgabe laden und prüfen, ob der Nutzer sie sehen/bearbeiten darf */
export async function ladeErlaubteAufgabe(svc: SupabaseClient, id: string, user: { id: string; role: string }) {
  const { data } = await svc.from('internal_tasks').select('id, title, assigned_to, board_id, created_by').eq('id', id).maybeSingle();
  const a = data as { id: string; title: string; assigned_to: string | null; board_id: string | null; created_by: string | null } | null;
  if (!a) return { fehler: 'Aufgabe nicht gefunden', status: 404 as const };
  if (user.role !== 'admin') {
    const { data: b } = a.board_id ? await svc.from('aufgaben_boards').select('id, besitzer_id').eq('id', a.board_id).maybeSingle() : { data: null };
    const boards = new Map(b ? [[(b as { id: string }).id, b as { besitzer_id: string | null }]] : []);
    if (!darfAufgabeSehen(a, boards, user)) return { fehler: 'Kein Zugriff auf diese Aufgabe', status: 403 as const };
  }
  return { aufgabe: a };
}
