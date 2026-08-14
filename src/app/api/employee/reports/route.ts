import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();

  // 1. Get employee's assigned agency_ids
  const { data: assignments } = await supabase
    .from('employee_assignments')
    .select('agency_id')
    .eq('employee_id', user.id);

  const agencyIds = (assignments ?? []).map((a: { agency_id: string }) => a.agency_id);

  if (agencyIds.length === 0) {
    return NextResponse.json({
      agencyIds: [],
      candidates: { total: 0, thisWeek: 0, hired: 0, hireRate: 0 },
      calls: { total: 0, reachRate: 0, terminRate: 0 },
      surveys: [],
      problems: [],
    });
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 2. Candidates across all assigned agencies
  const { data: candidates } = await supabase
    .from('candidates')
    .select('id, current_stage_id, created_at, agency_id')
    .in('agency_id', agencyIds);

  // Get "Eingestellt" stage ids
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, name');

  const hiredStageIds = new Set(
    (stages ?? []).filter((s: { id: string; name: string }) => s.name === 'Eingestellt').map((s: { id: string }) => s.id)
  );

  const totalCandidates = (candidates ?? []).length;
  const thisWeekCandidates = (candidates ?? []).filter(
    (c: { created_at: string }) => new Date(c.created_at) >= weekAgo
  ).length;
  const hiredCandidates = (candidates ?? []).filter(
    (c: { current_stage_id: string }) => hiredStageIds.has(c.current_stage_id)
  ).length;
  const hireRate = totalCandidates > 0 ? Math.round((hiredCandidates / totalCandidates) * 100) : 0;

  // 3. Call logs across all assigned agencies
  const { data: callLogs } = await supabase
    .from('call_logs')
    .select('id, result, agency_id')
    .in('agency_id', agencyIds);

  const totalCalls = (callLogs ?? []).length;
  const reached = (callLogs ?? []).filter(
    (c: { result: string }) => c.result !== 'nicht_erreicht'
  ).length;
  const termine = (callLogs ?? []).filter(
    (c: { result: string }) => c.result === 'termin_vereinbart'
  ).length;
  const reachRate = totalCalls > 0 ? Math.round((reached / totalCalls) * 100) : 0;
  const terminRate = totalCalls > 0 ? Math.round((termine / totalCalls) * 100) : 0;

  // 4. Survey responses — latest per agency
  const { data: surveyRows } = await supabase
    .from('survey_responses')
    .select('id, agency_id, rating, comment, created_at')
    .in('agency_id', agencyIds)
    .order('created_at', { ascending: false });

  // Get agency names
  const { data: agencies } = await supabase
    .from('agencies')
    .select('id, name')
    .in('id', agencyIds);

  const agencyNameMap: Record<string, string> = {};
  for (const a of agencies ?? []) {
    agencyNameMap[a.id] = a.name;
  }

  // Latest survey per agency
  const latestSurveyByAgency: Record<string, { id: string; agency_id: string; rating: number; comment: string | null; created_at: string }> = {};
  for (const row of surveyRows ?? []) {
    if (!latestSurveyByAgency[row.agency_id]) {
      latestSurveyByAgency[row.agency_id] = row;
    }
  }

  const surveys = Object.values(latestSurveyByAgency).map((s) => ({
    agencyId: s.agency_id,
    agencyName: agencyNameMap[s.agency_id] ?? s.agency_id,
    rating: s.rating,
    comment: s.comment,
    createdAt: s.created_at,
  }));

  const avgRating =
    surveys.length > 0
      ? Math.round((surveys.reduce((sum, s) => sum + s.rating, 0) / surveys.length) * 10) / 10
      : null;

  // 5. Active problems for assigned agencies
  const { data: problemRows } = await supabase
    .from('agency_problems')
    .select('id, agency_id, problem_key, severity, current_value, target_value, created_at')
    .in('agency_id', agencyIds)
    .eq('resolved', false)
    .order('created_at', { ascending: false });

  const problems = (problemRows ?? []).map((p: {
    id: string;
    agency_id: string;
    problem_key: string;
    severity: string;
    current_value: number | null;
    target_value: number | null;
    created_at: string;
  }) => ({
    ...p,
    agencyName: agencyNameMap[p.agency_id] ?? p.agency_id,
  }));

  return NextResponse.json({
    agencyIds,
    candidates: {
      total: totalCandidates,
      thisWeek: thisWeekCandidates,
      hired: hiredCandidates,
      hireRate,
    },
    calls: {
      total: totalCalls,
      reachRate,
      terminRate,
    },
    surveys: {
      items: surveys,
      avgRating,
    },
    problems,
  });
}
