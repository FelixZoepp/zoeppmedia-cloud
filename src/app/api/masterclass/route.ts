import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('agency_id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Get modules with lessons and lesson tasks
  const { data: modules } = await supabase
    .from('masterclass_modules')
    .select('*')
    .eq('published', true)
    .order('sort_order');

  const { data: lessons } = await supabase
    .from('masterclass_lessons')
    .select('*, lesson_tasks(*)')
    .order('sort_order');

  // Get progress for this agency
  const agencyId = profile.agency_id;
  let lessonProgress: Record<string, boolean> = {};
  let taskProgress: Record<string, boolean> = {};

  if (agencyId) {
    const { data: lp } = await supabase
      .from('agency_lesson_progress')
      .select('lesson_id, watched')
      .eq('agency_id', agencyId);

    const { data: tp } = await supabase
      .from('agency_task_progress')
      .select('task_id, completed')
      .eq('agency_id', agencyId);

    if (lp) lessonProgress = Object.fromEntries(lp.map((p) => [p.lesson_id, p.watched]));
    if (tp) taskProgress = Object.fromEntries(tp.map((p) => [p.task_id, p.completed]));
  }

  return NextResponse.json({
    modules: modules ?? [],
    lessons: lessons ?? [],
    lessonProgress,
    taskProgress,
  });
}
