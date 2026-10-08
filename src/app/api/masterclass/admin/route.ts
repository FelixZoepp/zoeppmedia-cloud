import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeLesson, sanitizeLessonHtml } from '@/lib/masterclass/lesson';
import { lessonSchemaReady } from '@/lib/masterclass/schema';

/** Admin-Übersicht: alle Module (auch unveröffentlicht) und alle Lektionen inkl. Entwürfe */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const svc = createAdminClient();
  const [{ data: modules }, { data: lessons }, ready] = await Promise.all([
    svc.from('masterclass_modules').select('*').order('sort_order'),
    svc.from('masterclass_lessons').select('*').order('sort_order'),
    lessonSchemaReady(svc),
  ]);
  return NextResponse.json({
    schema_ready: ready,
    modules: modules ?? [],
    lessons: (lessons ?? []).map((l) => normalizeLesson(l as Record<string, unknown>)),
  });
}

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { action, ...payload } = await req.json();

  if (action === 'create_module') {
    const { data, error } = await supabase
      .from('masterclass_modules')
      .insert(payload)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'create_lesson') {
    const svc = createAdminClient();
    const { count } = await svc.from('masterclass_lessons').select('id', { count: 'exact', head: true }).eq('module_id', payload.module_id);
    const row: Record<string, unknown> = {
      module_id: payload.module_id,
      title: String(payload.title ?? 'Neue Lektion').slice(0, 200),
      sort_order: (count ?? 0) + 1,
    };
    // Neue Lektionen starten als Entwurf, sobald es den Status gibt
    if (await lessonSchemaReady(svc)) row.status = 'entwurf';
    const { data, error } = await supabase
      .from('masterclass_lessons')
      .insert(row)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'create_lesson_task') {
    const { data, error } = await supabase
      .from('lesson_tasks')
      .insert(payload)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'update_module') {
    const { id, ...fields } = payload;
    const { data, error } = await supabase
      .from('masterclass_modules')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'update_lesson') {
    const { id, ...fields } = payload;
    // Gleiche HTML-Bereinigung wie im PATCH-Endpoint – sonst landet ungefiltertes HTML im Kundenportal
    if (typeof fields.content_html === 'string') fields.content_html = sanitizeLessonHtml(fields.content_html);
    const { data, error } = await supabase
      .from('masterclass_lessons')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'reorder') {
    const table = payload.table === 'module' ? 'masterclass_modules' : 'masterclass_lessons';
    const ids = Array.isArray(payload.ids) ? (payload.ids as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    for (const [i, id] of ids.entries()) {
      const { error } = await supabase.from(table).update({ sort_order: i + 1 }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete_module') {
    await supabase.from('masterclass_modules').delete().eq('id', payload.id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete_lesson') {
    await supabase.from('masterclass_lessons').delete().eq('id', payload.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
