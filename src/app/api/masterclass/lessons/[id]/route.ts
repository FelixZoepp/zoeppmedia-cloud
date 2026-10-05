import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { lessonPatchSchema, normalizeLesson, prepareLessonPatch } from '@/lib/masterclass/lesson';
import { lessonSchemaReady } from '@/lib/masterclass/schema';

type Ctx = { params: Promise<{ id: string }> };

/** Eine Lektion mit Modul, Nachbarn (vor/zurück) und – für Kunden – dem eigenen Fortschritt */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  const { id } = await params;
  const svc = createAdminClient();
  const admin = user.role === 'admin';

  const { data: row } = await svc.from('masterclass_lessons').select('*').eq('id', id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Lektion nicht gefunden' }, { status: 404 });
  const lesson = normalizeLesson(row as Record<string, unknown>);

  const { data: mod } = await svc.from('masterclass_modules').select('*').eq('id', lesson.module_id).maybeSingle();
  if (!admin && (lesson.status !== 'veroeffentlicht' || !(mod as { published?: boolean } | null)?.published)) {
    return NextResponse.json({ error: 'Lektion nicht gefunden' }, { status: 404 });
  }

  // Reihenfolge über alle (sichtbaren) Lektionen für Vor/Zurück
  const [{ data: modules }, { data: all }] = await Promise.all([
    svc.from('masterclass_modules').select('id, title, sort_order, published').order('sort_order'),
    svc.from('masterclass_lessons').select('*').order('sort_order'),
  ]);
  const modOrder = new Map(((modules ?? []) as Array<{ id: string; sort_order: number; published: boolean }>).map((m) => [m.id, m]));
  const sichtbar = ((all ?? []) as Record<string, unknown>[])
    .map(normalizeLesson)
    .filter((l) => admin || (l.status === 'veroeffentlicht' && modOrder.get(l.module_id)?.published))
    .sort((a, b) => (modOrder.get(a.module_id)?.sort_order ?? 0) - (modOrder.get(b.module_id)?.sort_order ?? 0) || a.sort_order - b.sort_order);
  const idx = sichtbar.findIndex((l) => l.id === lesson.id);

  let erledigt = false;
  let fortschritt: Record<string, boolean> = {};
  let aufgabenErledigt: Record<string, boolean> = {};
  // Fortschritt speichert /api/masterclass/progress an users.agency_id – hier dieselbe Quelle
  const agencyId = admin ? null : user.agency_id;
  const { data: aufgaben } = await svc.from('lesson_tasks').select('id, title, description, sort_order').eq('lesson_id', lesson.id).order('sort_order');
  if (agencyId) {
    const taskIds = ((aufgaben ?? []) as Array<{ id: string }>).map((t) => t.id);
    const [{ data: lp }, { data: tp }] = await Promise.all([
      svc.from('agency_lesson_progress').select('lesson_id, watched').eq('agency_id', agencyId),
      taskIds.length ? svc.from('agency_task_progress').select('task_id, completed').eq('agency_id', agencyId).in('task_id', taskIds) : Promise.resolve({ data: [] }),
    ]);
    fortschritt = Object.fromEntries(((lp ?? []) as Array<{ lesson_id: string; watched: boolean }>).map((p) => [p.lesson_id, p.watched]));
    aufgabenErledigt = Object.fromEntries(((tp ?? []) as Array<{ task_id: string; completed: boolean }>).map((p) => [p.task_id, p.completed]));
    erledigt = !!fortschritt[lesson.id];
  }

  return NextResponse.json({
    lesson,
    module: mod,
    modules: (modules ?? []).filter((m) => admin || (m as { published: boolean }).published),
    modul_lektionen: sichtbar.filter((l) => l.module_id === lesson.module_id).map((l) => ({ id: l.id, title: l.title, status: l.status, typ: l.typ, duration_minutes: l.duration_minutes, erledigt: !!fortschritt[l.id] })),
    vorher: idx > 0 ? { id: sichtbar[idx - 1].id, title: sichtbar[idx - 1].title } : null,
    nachher: idx >= 0 && idx < sichtbar.length - 1 ? { id: sichtbar[idx + 1].id, title: sichtbar[idx + 1].title } : null,
    erledigt,
    aufgaben: ((aufgaben ?? []) as Array<{ id: string; title: string; description: string | null }>).map((t) => ({ ...t, erledigt: !!aufgabenErledigt[t.id] })),
    kann_fortschritt_speichern: !!agencyId,
    schema_ready: admin ? await lessonSchemaReady(svc) : undefined,
  });
}

/** Lektion speichern (nur Admin) – Felder werden validiert, HTML gefiltert */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur Admins können Lektionen bearbeiten' }, { status: 403 });
  const { id } = await params;
  const parsed = lessonPatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Ungültige Eingabe' }, { status: 400 });
  }
  const svc = createAdminClient();
  const ready = await lessonSchemaReady(svc);
  const row = prepareLessonPatch(parsed.data, ready);
  const { data, error } = await svc.from('masterclass_lessons').update(row).eq('id', id).select('*').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Lektion nicht gefunden' }, { status: 404 });
  return NextResponse.json({ lesson: normalizeLesson(data as Record<string, unknown>), schema_ready: ready });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur Admins können Lektionen löschen' }, { status: 403 });
  const { id } = await params;
  const { error } = await createAdminClient().from('masterclass_lessons').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
