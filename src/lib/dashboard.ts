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

  // All candidates
  const { count: totalCandidates } = await supabase
    .from('candidates')
    .select('*', { count: 'exact', head: true })
    .eq('agency_id', agencyId);

  // New this week
  const { count: newThisWeek } = await supabase
    .from('candidates')
    .select('*', { count: 'exact', head: true })
    .eq('agency_id', agencyId)
    .gte('created_at', startOfWeek.toISOString());

  // New prev week
  const { count: newPrevWeek } = await supabase
    .from('candidates')
    .select('*', { count: 'exact', head: true })
    .eq('agency_id', agencyId)
    .gte('created_at', startOfPrevWeek.toISOString())
    .lt('created_at', endOfPrevWeek.toISOString());

  // Hired (stage "Eingestellt")
  const { data: hiredStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('name', 'Eingestellt')
    .single();

  const hiredStageId = hiredStage?.id;

  const { count: hired } = hiredStageId
    ? await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .eq('current_stage_id', hiredStageId)
    : { count: 0 };

  // Hired prev week (approximation: total hired before this week minus total hired before prev week)
  const { count: hiredPrevWeekCount } = hiredStageId
    ? await supabase
        .from('candidate_stages')
        .select('*', { count: 'exact', head: true })
        .eq('stage_id', hiredStageId)
        .gte('changed_at', startOfPrevWeek.toISOString())
        .lt('changed_at', endOfPrevWeek.toISOString())
    : { count: 0 };

  // Candidates before prev week for total comparison
  const { count: totalPrevWeekEnd } = await supabase
    .from('candidates')
    .select('*', { count: 'exact', head: true })
    .eq('agency_id', agencyId)
    .lt('created_at', endOfPrevWeek.toISOString());

  // Candidates over time (last 6 months)
  const months: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const label = d.toLocaleDateString('de-DE', { month: 'short' });

    const { count } = await supabase
      .from('candidates')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', agencyId)
      .gte('created_at', d.toISOString())
      .lt('created_at', nextMonth.toISOString());

    months.push({ month: label, count: count ?? 0 });
  }

  // Source breakdown
  const { data: allCandidates } = await supabase
    .from('candidates')
    .select('source')
    .eq('agency_id', agencyId);

  const sourceCounts: Record<string, number> = { meta: 0, indeed: 0, manual: 0 };
  (allCandidates ?? []).forEach((c) => {
    sourceCounts[c.source] = (sourceCounts[c.source] || 0) + 1;
  });

  const sourceLabels: Record<string, string> = { meta: 'Meta Ads', indeed: 'Indeed', manual: 'Manuell' };
  const sourceBreakdown = Object.entries(sourceCounts).map(([key, count]) => ({
    name: sourceLabels[key] || key,
    count,
  }));

  // Stage breakdown
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, name, color, sort_order')
    .order('sort_order');

  const stageBreakdown: { name: string; count: number; color: string }[] = [];
  for (const stage of stages ?? []) {
    const { count } = await supabase
      .from('candidates')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', agencyId)
      .eq('current_stage_id', stage.id);

    stageBreakdown.push({ name: stage.name, count: count ?? 0, color: stage.color });
  }

  // Recent candidates
  const { data: recent } = await supabase
    .from('candidates')
    .select('id, name, source, created_at')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(5);

  // Indeed daily budget from onboarding
  const { data: onboarding } = await supabase
    .from('onboarding_submissions')
    .select('indeed_daily_budget, meta_daily_budget')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

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
