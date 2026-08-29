import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/candidates/[id]/detail
 *
 * Returns enriched candidate data in a single request:
 * candidate, stage history, notes, call logs, recordings,
 * pipeline stages, calendly events, and activity timeline.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch candidate with all fields (including the ones not in the TS type yet)
  const { data: candidate } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', id)
    .single();

  if (!candidate)
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  // Parallel fetches for all related data
  const [
    { data: stageHistory },
    { data: notes },
    { data: stages },
    { data: callLogs },
    { data: recordings },
    { data: calendlyEvents },
    { data: timeline },
  ] = await Promise.all([
    supabase
      .from('candidate_stages')
      .select('*, stage:pipeline_stages(*), user:users(name)')
      .eq('candidate_id', id)
      .order('changed_at', { ascending: false }),
    supabase
      .from('notes')
      .select('*, user:users(name)')
      .eq('candidate_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('pipeline_stages')
      .select('*')
      .order('sort_order'),
    supabase
      .from('call_logs')
      .select('*')
      .eq('candidate_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('call_recordings')
      .select('*')
      .eq('candidate_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('calendly_events')
      .select('*')
      .eq('candidate_id', id)
      .order('start_time', { ascending: false }),
    supabase
      .from('activity_log')
      .select('*, user:users(name)')
      .eq('candidate_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  // Find current stage info
  const currentStage = (stages || []).find(
    (s: { id: string }) => s.id === candidate.current_stage_id
  ) || null;

  return NextResponse.json({
    candidate,
    stageHistory: stageHistory || [],
    notes: notes || [],
    stages: stages || [],
    callLogs: callLogs || [],
    recordings: recordings || [],
    calendlyEvents: calendlyEvents || [],
    timeline: timeline || [],
    currentStage,
  });
}
