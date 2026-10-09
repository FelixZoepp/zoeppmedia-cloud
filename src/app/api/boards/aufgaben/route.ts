import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { benachrichtige, boardVon, PRIORITAETEN } from '@/lib/aufgaben/boards';

const AUSWAHL = 'id, title, description, assigned_to, board_id, status, priority, due_date, quelle, serie_id, position, agency_id, created_by, created_at, erledigt_am, agencies(name)';

/** POST { title, board_id?, assigned_to?, description?, due_date?, priority?, agency_id? } – Aufgabe anlegen */
export async function POST(req: NextRequest) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'Titel fehlt' }, { status: 400 });
  const svc = createAdminClient();
  const assigned = typeof b.assigned_to === 'string' && b.assigned_to ? b.assigned_to : null;
  const board = typeof b.board_id === 'string' && b.board_id ? b.board_id : await boardVon(svc, assigned ?? user.id);
  const { data, error } = await svc
    .from('internal_tasks')
    .insert({
      title: title.slice(0, 200),
      description: typeof b.description === 'string' && b.description.trim() ? b.description.slice(0, 5000) : null,
      assigned_to: assigned,
      board_id: board,
      due_date: typeof b.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.due_date) ? b.due_date : null,
      priority: PRIORITAETEN.includes(b.priority as never) ? b.priority : 'medium',
      agency_id: typeof b.agency_id === 'string' && b.agency_id ? b.agency_id : null,
      status: 'todo',
      quelle: 'manuell',
      created_by: user.id,
    })
    .select(AUSWAHL)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await benachrichtige(svc, data as { id: string; title: string; assigned_to: string | null; due_date: string | null }, user.id, user.name);
  return NextResponse.json(data);
}
