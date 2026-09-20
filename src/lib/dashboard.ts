import { createServerClient } from '@/lib/supabase/server';

export interface DashboardData {
  totalCandidates: number;
  newThisWeek: number;
  hired: number;
  totalPrevWeek: number;
  newPrevWeek: number;
  hiredPrevWeek: number;
  candidatesOverTime: { month: string; count: number }[];
  sourceBreakdown: { name: string; count: number }[];
  stageBreakdown: { name: string; count: number; color: string }[];
  recentCandidates: { id: string; name: string; source: string; created_at: string }[];
  indeedDailyBudget: number | null;
  metaDailyBudget: number | null;
}

export async function getDashboardData(agencyId: string): Promise<DashboardData> {
  const supabase = await createServerClient();

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfPrevWeek = new Date(startOfWeek);
  startOfPrevWeek.setDate(startOfPrevWeek.getDate() - 7);
  const endOfPrevWeek = new Date(startOfWeek);

  const monthDefs = Array.from({ length: 6 }, (_, idx) => {
    const i = 5 - idx;
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return { start: d, end: nextMonth, label: d.toLocaleDateString('de-DE', { month: 'short' }) };
  });

  // Phase 1: everything without dependencies, in parallel
  const [
    { count: totalCandidates },
    { count: newThisWeek },
    { count: newPrevWeek },
    { data: hiredStage },
    { count: totalPrevWeekEnd },
    monthCounts,
    { data: allCandidates },
    { data: stages },
    { data: recent },
    { data: onboarding },
  ] = await Promise.all([
    supabase.from('candidates').select('*', { count: 'exact', head: true }).eq('agency_id', agencyId),
    supabase.from('candidates').select('*', { count: 'exact', head: true }).eq('agency_id', agencyId)
      .gte('created_at', startOfWeek.toISOString()),
    supabase.from('candidates').select('*', { count: 'exact', head: true }).eq('agency_id', agencyId)
      .gte('created_at', startOfPrevWeek.toISOString()).lt('created_at', endOfPrevWeek.toISOString()),
    supabase.from('pipeline_stages').select('id').eq('name', 'Eingestellt').single(),
    supabase.from('candidates').select('*', { count: 'exact', head: true }).eq('agency_id', agencyId)
      .lt('created_at', endOfPrevWeek.toISOString()),
    Promise.all(monthDefs.map((m) =>
      supabase.from('candidates').select('*', { count: 'exact', head: true }).eq('agency_id', agencyId)
        .gte('created_at', m.start.toISOString()).lt('created_at', m.end.toISOString())
    )),
    supabase.from('candidates').select('source').eq('agency_id', agencyId),
    supabase.from('pipeline_stages').select('id, name, color, sort_order').order('sort_order'),
    supabase.from('candidates').select('id, name, source, created_at').eq('agency_id', agencyId)
      .order('created_at', { ascending: false }).limit(5),
    supabase.from('onboarding_submissions').select('indeed_daily_budget, meta_daily_budget')
      .eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(1).single(),
  ]);

  const hiredStageId = hiredStage?.id;

  // Phase 2: queries depending on hiredStageId / stages, in parallel
  const [{ count: hired }, { count: hiredPrevWeekCount }, stageCounts] = await Promise.all([
    hiredStageId
      ? supabase.from('candidates').select('*', { count: 'exact', head: true })
          .eq('agency_id', agencyId).eq('current_stage_id', hiredStageId)
      : Promise.resolve({ count: 0 }),
    hiredStageId
      ? supabase.from('candidate_stages').select('*', { count: 'exact', head: true })
          .eq('stage_id', hiredStageId)
          .gte('changed_at', startOfPrevWeek.toISOString()).lt('changed_at', endOfPrevWeek.toISOString())
      : Promise.resolve({ count: 0 }),
    Promise.all((stages ?? []).map((stage) =>
      supabase.from('candidates').select('*', { count: 'exact', head: true })
        .eq('agency_id', agencyId).eq('current_stage_id', stage.id)
    )),
  ]);

  const months = monthDefs.map((m, i) => ({ month: m.label, count: monthCounts[i].count ?? 0 }));

  const sourceCounts: Record<string, number> = { meta: 0, indeed: 0, manual: 0 };
  (allCandidates ?? []).forEach((c) => {
    sourceCounts[c.source] = (sourceCounts[c.source] || 0) + 1;
  });

  const sourceLabels: Record<string, string> = { meta: 'Meta Ads', indeed: 'Indeed', manual: 'Manuell' };
  const sourceBreakdown = Object.entries(sourceCounts).map(([key, count]) => ({
    name: sourceLabels[key] || key,
    count,
  }));

  const stageBreakdown = (stages ?? []).map((stage, i) => ({
    name: stage.name,
    count: stageCounts[i].count ?? 0,
    color: stage.color,
  }));

  const indeedDailyBudget = onboarding?.indeed_daily_budget
    ? parseFloat(onboarding.indeed_daily_budget)
    : null;

  const metaDailyBudget = onboarding?.meta_daily_budget
    ? parseFloat(onboarding.meta_daily_budget)
    : null;

  return {
    totalCandidates: totalCandidates ?? 0,
    newThisWeek: newThisWeek ?? 0,
    hired: hired ?? 0,
    totalPrevWeek: totalPrevWeekEnd ?? 0,
    newPrevWeek: newPrevWeek ?? 0,
    hiredPrevWeek: hiredPrevWeekCount ?? 0,
    candidatesOverTime: months,
    sourceBreakdown,
    stageBreakdown,
    recentCandidates: (recent ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      source: c.source,
      created_at: c.created_at,
    })),
    indeedDailyBudget,
    metaDailyBudget,
  };
}
