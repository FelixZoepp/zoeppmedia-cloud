import { createServerClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getStagesForAgency, istEingestelltStage } from '@/lib/pipeline/get-stages';
import { berlinMonatsStart, berlinWochenStart } from '@/lib/zeit/berlin';

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
  // Wochen- und Monatsgrenzen in Berliner Zeit (Montag als Wochenbeginn, auch sonntags)
  const startOfWeek = berlinWochenStart(now);
  const startOfPrevWeek = berlinWochenStart(new Date(startOfWeek.getTime() - 3 * 864e5));
  const endOfPrevWeek = startOfWeek;

  const monthDefs = Array.from({ length: 6 }, (_, idx) => {
    const i = 5 - idx;
    const d = berlinMonatsStart(now, -i);
    const nextMonth = berlinMonatsStart(now, -i + 1);
    return { start: d, end: nextMonth, label: d.toLocaleDateString('de-DE', { month: 'short', timeZone: 'Europe/Berlin' }) };
  });

  // Phase 1: everything without dependencies, in parallel
  const [
    { count: totalCandidates },
    { count: newThisWeek },
    { count: newPrevWeek },
    { count: totalPrevWeekEnd },
    monthCounts,
    allCandidates,
    stages,
    { data: recent },
    { data: onboarding },
  ] = await Promise.all([
    supabase.from('candidates').select('*', { count: 'exact', head: true }).eq('agency_id', agencyId),
    supabase.from('candidates').select('*', { count: 'exact', head: true }).eq('agency_id', agencyId)
      .gte('created_at', startOfWeek.toISOString()),
    supabase.from('candidates').select('*', { count: 'exact', head: true }).eq('agency_id', agencyId)
      .gte('created_at', startOfPrevWeek.toISOString()).lt('created_at', endOfPrevWeek.toISOString()),
    supabase.from('candidates').select('*', { count: 'exact', head: true }).eq('agency_id', agencyId)
      .lt('created_at', endOfPrevWeek.toISOString()),
    Promise.all(monthDefs.map((m) =>
      supabase.from('candidates').select('*', { count: 'exact', head: true }).eq('agency_id', agencyId)
        .gte('created_at', m.start.toISOString()).lt('created_at', m.end.toISOString())
    )),
    // Quellen seitenweise – Supabase liefert sonst höchstens 1000 Zeilen
    fetchAll<{ source: string }>((rFrom, rTo) =>
      supabase.from('candidates').select('source').eq('agency_id', agencyId).order('id').range(rFrom, rTo),
    ),
    // Effektive Pipeline der Agentur (eigene Phasen, sonst globale)
    getStagesForAgency(supabase, agencyId),
    supabase.from('candidates').select('id, name, source, created_at').eq('agency_id', agencyId)
      .order('created_at', { ascending: false }).limit(5),
    supabase.from('onboarding_submissions').select('indeed_daily_budget, meta_daily_budget')
      .eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(1).single(),
  ]);

  // „Eingestellt“ über stage_type der Agentur-Pipeline statt global per Name
  const hiredStageIds = stages.filter(istEingestelltStage).map((s) => s.id);

  // Phase 2: queries depending on hiredStageIds / stages, in parallel
  const [{ count: hired }, { count: hiredPrevWeekCount }, stageCounts] = await Promise.all([
    hiredStageIds.length
      ? supabase.from('candidates').select('*', { count: 'exact', head: true })
          .eq('agency_id', agencyId).in('current_stage_id', hiredStageIds)
      : Promise.resolve({ count: 0 }),
    hiredStageIds.length
      ? supabase.from('candidate_stages').select('candidate_id, candidates!inner(agency_id)', { count: 'exact', head: true })
          .eq('candidates.agency_id', agencyId)
          .in('stage_id', hiredStageIds)
          .gte('changed_at', startOfPrevWeek.toISOString()).lt('changed_at', endOfPrevWeek.toISOString())
      : Promise.resolve({ count: 0 }),
    Promise.all((stages ?? []).map((stage) =>
      supabase.from('candidates').select('*', { count: 'exact', head: true })
        .eq('agency_id', agencyId).eq('current_stage_id', stage.id)
    )),
  ]);

  const months = monthDefs.map((m, i) => ({ month: m.label, count: monthCounts[i].count ?? 0 }));

  const sourceCounts: Record<string, number> = { meta: 0, indeed: 0, manual: 0 };
  allCandidates.forEach((c) => {
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
