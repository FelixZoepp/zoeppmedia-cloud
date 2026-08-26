import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('agency_id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Determine agency ID
  const searchParams = request.nextUrl.searchParams;
  const requestedAgencyId = searchParams.get('agencyId');
  const isInternal = profile.role === 'admin' || profile.role === 'employee';
  const agencyId = isInternal && requestedAgencyId ? requestedAgencyId : profile.agency_id;

  if (!agencyId) {
    return NextResponse.json({ modules: [], totalModules: 0, completedModules: 0 });
  }

  // Get agency onboarding date
  const { data: agency } = await supabase
    .from('agencies')
    .select('created_at')
    .eq('id', agencyId)
    .single();

  const daysSinceOnboarding = agency
    ? Math.floor(
        (Date.now() - new Date(agency.created_at).getTime()) / (1000 * 60 * 60 * 24)
      )
    : 0;

  // Get published modules
  const { data: modules } = await supabase
    .from('masterclass_modules')
    .select('id, title, sort_order')
    .eq('published', true)
    .order('sort_order');

  // Get all lessons
  const { data: lessons } = await supabase
    .from('masterclass_lessons')
    .select('id, module_id')
    .order('sort_order');

  // Get progress for this agency
  const { data: progress } = await supabase
    .from('agency_lesson_progress')
    .select('lesson_id, watched')
    .eq('agency_id', agencyId);

  const watchedSet = new Set(
    (progress ?? []).filter((p) => p.watched).map((p) => p.lesson_id)
  );

  // Build module progress data
  const moduleProgress = (modules ?? []).map((mod) => {
    const moduleLessons = (lessons ?? []).filter((l) => l.module_id === mod.id);
    const completedLessons = moduleLessons.filter((l) =>
      watchedSet.has(l.id)
    ).length;
    const isComplete = moduleLessons.length > 0 && completedLessons === moduleLessons.length;

    // Module 2 overdue after 10 days, Module 7 overdue after 14 days
    let isOverdue = false;
    if (mod.sort_order === 2 && daysSinceOnboarding >= 10 && !isComplete) {
      isOverdue = true;
    }
    if (mod.sort_order === 7 && daysSinceOnboarding >= 14 && !isComplete) {
      isOverdue = true;
    }

    return {
      id: mod.id,
      title: mod.title,
      sort_order: mod.sort_order,
      totalLessons: moduleLessons.length,
      completedLessons,
      isComplete,
      isOverdue,
    };
  });

  const completedModules = moduleProgress.filter((m) => m.isComplete).length;

  return NextResponse.json({
    modules: moduleProgress,
    totalModules: moduleProgress.length,
    completedModules,
  });
}
