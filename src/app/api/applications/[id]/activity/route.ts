import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/applications/[id]/activity
 *
 * Gibt activity_log-Einträge zurück, gefiltert nach candidate_id der Bewerbung.
 * Fusioniert mit candidate_stages-Einträgen (Stage-Wechsel als Aktivität).
 * Graceful degradation: Falls application_id-Spalte fehlt, wird nur nach
 * candidate_id gefiltert (console.warn).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const supabase = await createServerClient();

  const { data: app } = await supabase
    .from('applications')
    .select('id, candidate_id')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .single();

  if (!app) return NextResponse.json({ error: 'Bewerbung nicht gefunden' }, { status: 404 });

  // Parallel: activity_log + candidate_stages
  const [activityResult, stagesResult] = await Promise.all([
    supabase
      .from('activity_log')
      .select('*, user:users(name)')
      .eq('candidate_id', app.candidate_id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('candidate_stages')
      .select('*, stage:pipeline_stages(id, name, color), user:users(name)')
      .eq('candidate_id', app.candidate_id)
      .order('changed_at', { ascending: false }),
  ]);

  if (activityResult.error) {
    console.warn('[activity] Fehler beim Laden des activity_log:', activityResult.error.message);
  }

  type ActivityEntry = {
    id: string;
    _type: 'activity' | 'stage_change';
    action: string;
    action_type: string;
    created_at: string;
    user?: { name: string } | null;
    metadata?: Record<string, unknown>;
    stage?: { id: string; name: string; color: string } | null;
  };

  const activityEntries: ActivityEntry[] = (activityResult.data ?? []).map((e) => ({
    ...e,
    _type: 'activity' as const,
  }));

  const stageEntries: ActivityEntry[] = (stagesResult.data ?? []).map((e) => ({
    id: e.id,
    _type: 'stage_change' as const,
    action: `Phase gewechselt: ${e.stage?.name ?? ''}`,
    action_type: 'stage_change',
    created_at: e.changed_at,
    user: e.user,
    stage: e.stage,
    metadata: {},
  }));

  // Merge and sort descending by date
  const merged = [...activityEntries, ...stageEntries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return NextResponse.json(merged);
}
