import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { AUFGABEN_STATUS, benachrichtige, PRIORITAETEN } from '@/lib/aufgaben/boards';

const AUSWAHL = 'id, title, description, assigned_to, board_id, status, priority, due_date, quelle, serie_id, position, agency_id, created_by, created_at, erledigt_am, agencies(name)';

/** PATCH – Felder ändern (Status, Position, Board, Zuständig, Fälligkeit, Priorität, Titel, Beschreibung) */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const svc = createAdminClient();
  const { data: alt } = await svc.from('internal_tasks').select('assigned_to, status').eq('id', id).maybeSingle();
  if (!alt) return NextResponse.json({ error: 'Aufgabe nicht gefunden' }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.title === 'string' && b.title.trim()) patch.title = b.title.trim().slice(0, 200);
  if ('description' in b) patch.description = typeof b.description === 'string' && b.description.trim() ? b.description.slice(0, 5000) : null;
  if ('assigned_to' in b) patch.assigned_to = typeof b.assigned_to === 'string' && b.assigned_to ? b.assigned_to : null;
  if ('board_id' in b) patch.board_id = typeof b.board_id === 'string' && b.board_id ? b.board_id : null;
  if ('due_date' in b) patch.due_date = typeof b.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.due_date) ? b.due_date : null;
  if (PRIORITAETEN.includes(b.priority as never)) patch.priority = b.priority;
  if (typeof b.position === 'number' && Number.isFinite(b.position)) patch.position = b.position;
  if (AUFGABEN_STATUS.includes(b.status as never)) {
    patch.status = b.status;
    if (b.status === 'done' && (alt as { status: string }).status !== 'done') patch.erledigt_am = new Date().toISOString();
    if (b.status !== 'done') patch.erledigt_am = null;
  }

  const { data, error } = await svc.from('internal_tasks').update(patch).eq('id', id).select(AUSWAHL).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const neu = data as { id: string; title: string; assigned_to: string | null; due_date: string | null };
  if ('assigned_to' in patch && neu.assigned_to && neu.assigned_to !== (alt as { assigned_to: string | null }).assigned_to) {
    await benachrichtige(svc, neu, user.id, user.name, 'zugewiesen');
  }
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const { error } = await createAdminClient().from('internal_tasks').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
