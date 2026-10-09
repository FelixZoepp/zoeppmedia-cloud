/**
 * Aufgaben-Boards: jeder interne Mitarbeiter hat ein persönliches Board, dazu Team-Boards.
 * Aufgaben liegen in internal_tasks (board_id). Ältere Aufgaben ohne Board erscheinen auf dem
 * persönlichen Board der zugewiesenen Person.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface Board {
  id: string;
  name: string;
  besitzer_id: string | null;
  beschreibung: string | null;
  farbe: string | null;
  sortierung: number;
}

export interface TeamMitglied {
  id: string;
  name: string;
  funktion: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: string;
}

export { AUFGABEN_STATUS, STATUS_LABEL, PRIORITAETEN, PRIO_LABEL, type AufgabenStatus, type Prioritaet } from './konstanten';

export async function ladeTeam(svc: SupabaseClient): Promise<TeamMitglied[]> {
  const { data } = await svc
    .from('users')
    .select('id, name, funktion, avatar_url, phone, role, aktiv')
    .in('role', ['admin', 'employee'])
    .order('name');
  return ((data ?? []) as Array<TeamMitglied & { aktiv: boolean | null }>).filter((u) => u.aktiv !== false);
}

/** Persönliche Boards für alle aktiven internen Nutzer sicherstellen */
export async function stelleBoardsSicher(svc: SupabaseClient, team: TeamMitglied[]): Promise<Board[]> {
  const { data } = await svc.from('aufgaben_boards').select('id, name, besitzer_id, beschreibung, farbe, sortierung').order('sortierung').order('name');
  const boards = (data ?? []) as Board[];
  const fehlend = team.filter((u) => !boards.some((b) => b.besitzer_id === u.id));
  if (fehlend.length) {
    const { data: neu } = await svc
      .from('aufgaben_boards')
      .upsert(
        fehlend.map((u) => ({ name: u.name, besitzer_id: u.id })),
        { onConflict: 'besitzer_id', ignoreDuplicates: true },
      )
      .select('id, name, besitzer_id, beschreibung, farbe, sortierung');
    boards.push(...((neu ?? []) as Board[]));
  }
  return boards;
}

/** Board-ID für eine Person (persönliches Board) */
export async function boardVon(svc: SupabaseClient, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await svc.from('aufgaben_boards').select('id').eq('besitzer_id', userId).maybeSingle();
  if (data) return (data as { id: string }).id;
  const { data: u } = await svc.from('users').select('name').eq('id', userId).maybeSingle();
  const { data: neu } = await svc
    .from('aufgaben_boards')
    .upsert({ name: (u as { name: string } | null)?.name ?? 'Board', besitzer_id: userId }, { onConflict: 'besitzer_id' })
    .select('id')
    .single();
  return (neu as { id: string } | null)?.id ?? null;
}

/** Neue Aufgabe → Push + Glocke an die zuständige Person (nicht an sich selbst) */
export async function benachrichtige(
  svc: SupabaseClient,
  a: { id: string; title: string; assigned_to: string | null; due_date?: string | null },
  vonId: string | null,
  vonName: string | null,
  art: 'neu' | 'zugewiesen' | 'serie' = 'neu',
): Promise<void> {
  if (!a.assigned_to || a.assigned_to === vonId) return;
  const { createNotification } = await import('@/lib/notifications/create');
  const faellig = a.due_date ? ` · fällig ${new Date(`${a.due_date}T12:00:00Z`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}` : '';
  await createNotification(svc, {
    user_id: a.assigned_to,
    title: art === 'serie' ? `Neue wiederkehrende Aufgabe: ${a.title}` : `Neue Aufgabe auf deinem Board: ${a.title}`,
    body: `${vonName ? `Von ${vonName}` : 'Neu'}${faellig}`,
    type: 'task_assigned',
    entity_type: 'task',
    entity_id: a.id,
    push_url: `/boards?aufgabe=${a.id}`,
  }).catch((err) => console.error('[boards] Benachrichtigung fehlgeschlagen', err));
}
