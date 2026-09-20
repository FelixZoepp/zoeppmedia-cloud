import { createAdminClient } from '@/lib/supabase/admin';

export interface AgencyStatus {
  id: string;
  name: string;
  status: 'green' | 'yellow' | 'red';
  problemCount: number;
  criticalCount: number;
  warningCount: number;
}

export interface AdminDashboardData {
  totalAgencies: number;
  totalCandidates: number;
  totalHired: number;
  newCandidatesThisWeek: number;
  agenciesPrevWeek: number;
  candidatesPrevWeek: number;
  hiredPrevWeek: number;
  newCandidatesPrevWeek: number;
  candidatesOverTime: { month: string; count: number }[];
  sourceBreakdown: { name: string; count: number }[];
  topAgencies: { id: string; name: string; candidates: number; hired: number }[];
  recentCandidates: { id: string; name: string; agency_name: string; source: string; created_at: string }[];
  agencyStatuses: AgencyStatus[];
  totalProblems: number;
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const admin = createAdminClient();

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1);
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
    { count: totalAgencies },
    { count: agenciesPrevWeek },
    { count: totalCandidates },
    { count: candidatesPrevWeek },
    { count: newCandidatesThisWeek },
    { count: newCandidatesPrevWeek },
    { data: hiredStage },
    monthCounts,
    { data: allCandidatesSource },
    { data: allAgencies },
    { data: allProblems },
    { data: candidatesByAgency },
    { data: recent },
  ] = await Promise.all([
    admin.from('agencies').select('*', { count: 'exact', head: true }),
    admin.from('agencies').select('*', { count: 'exact', head: true })
      .lt('created_at', endOfPrevWeek.toISOString()),
    admin.from('candidates').select('*', { count: 'exact', head: true }),
    admin.from('candidates').select('*', { count: 'exact', head: true })
      .lt('created_at', endOfPrevWeek.toISOString()),
    admin.from('candidates').select('*', { count: 'exact', head: true })
      .gte('created_at', startOfWeek.toISOString()),
    admin.from('candidates').select('*', { count: 'exact', head: true })
      .gte('created_at', startOfPrevWeek.toISOString()).lt('created_at', endOfPrevWeek.toISOString()),
    admin.from('pipeline_stages').select('id').eq('name', 'Eingestellt').single(),
    Promise.all(monthDefs.map((m) =>
      admin.from('candidates').select('*', { count: 'exact', head: true })
        .gte('created_at', m.start.toISOString()).lt('created_at', m.end.toISOString())
    )),
    admin.from('candidates').select('source'),
    admin.from('agencies').select('id, name'),
    admin.from('agency_problems').select('agency_id, severity').is('resolved_at', null),
    admin.from('candidates').select('agency_id, current_stage_id'),
    admin.from('candidates').select('id, name, source, created_at, agency_id')
      .order('created_at', { ascending: false }).limit(5),
  ]);

  const hiredStageId = hiredStage?.id;

  // Phase 2: queries depending on hiredStageId, in parallel
  const [{ count: totalHired }, { count: hiredPrevWeek }] = await Promise.all([
    hiredStageId
      ? admin.from('candidates').select('*', { count: 'exact', head: true }).eq('current_stage_id', hiredStageId)
      : Promise.resolve({ count: 0 }),
    hiredStageId
      ? admin.from('candidate_stages').select('*', { count: 'exact', head: true })
          .eq('stage_id', hiredStageId)
          .gte('changed_at', startOfPrevWeek.toISOString()).lt('changed_at', endOfPrevWeek.toISOString())
      : Promise.resolve({ count: 0 }),
  ]);

  const candidatesOverTime = monthDefs.map((m, i) => ({
    month: m.label,
    count: monthCounts[i].count ?? 0,
  }));

  // Source breakdown
  const sourceCounts: Record<string, number> = { meta: 0, indeed: 0, manual: 0 };
  (allCandidatesSource ?? []).forEach((c) => {
    sourceCounts[c.source] = (sourceCounts[c.source] || 0) + 1;
  });
  const sourceLabels: Record<string, string> = { meta: 'Meta Ads', indeed: 'Indeed', manual: 'Manuell' };
  const sourceBreakdown = Object.entries(sourceCounts).map(([key, count]) => ({
    name: sourceLabels[key] || key,
    count,
  }));

  // Agency problem statuses (traffic light)
  const problemsByAgency = new Map<string, { critical: number; warning: number }>();
  for (const p of allProblems || []) {
    if (!problemsByAgency.has(p.agency_id)) problemsByAgency.set(p.agency_id, { critical: 0, warning: 0 });
    const counts = problemsByAgency.get(p.agency_id)!;
    if (p.severity === 'critical') counts.critical++;
    else counts.warning++;
  }

  const agencyStatuses: AgencyStatus[] = (allAgencies || []).map((a) => {
    const counts = problemsByAgency.get(a.id) || { critical: 0, warning: 0 };
    const total = counts.critical + counts.warning;
    return {
      id: a.id,
      name: a.name,
      status: counts.critical > 0 ? 'red' : counts.warning > 0 ? 'yellow' : 'green',
      problemCount: total,
      criticalCount: counts.critical,
      warningCount: counts.warning,
    };
  });

  const totalProblems = (allProblems || []).length;

  // Top agencies by candidate count
  const agencyMap: Record<string, { candidates: number; hired: number }> = {};
  (candidatesByAgency ?? []).forEach((c) => {
    if (!agencyMap[c.agency_id]) agencyMap[c.agency_id] = { candidates: 0, hired: 0 };
    agencyMap[c.agency_id].candidates++;
    if (hiredStageId && c.current_stage_id === hiredStageId) agencyMap[c.agency_id].hired++;
  });

  const topAgencies = (allAgencies ?? [])
    .map((a) => ({
      id: a.id,
      name: a.name,
      candidates: agencyMap[a.id]?.candidates ?? 0,
      hired: agencyMap[a.id]?.hired ?? 0,
    }))
    .sort((a, b) => b.candidates - a.candidates)
    .slice(0, 5);

  // Recent candidates with agency name
  const agencyNames: Record<string, string> = {};
  (allAgencies ?? []).forEach((a) => { agencyNames[a.id] = a.name; });

  const recentCandidates = (recent ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    agency_name: agencyNames[c.agency_id] || 'Unbekannt',
    source: c.source,
    created_at: c.created_at,
  }));

  return {
    totalAgencies: totalAgencies ?? 0,
    totalCandidates: totalCandidates ?? 0,
    totalHired: totalHired ?? 0,
    newCandidatesThisWeek: newCandidatesThisWeek ?? 0,
    agenciesPrevWeek: agenciesPrevWeek ?? 0,
    candidatesPrevWeek: candidatesPrevWeek ?? 0,
    hiredPrevWeek: hiredPrevWeek ?? 0,
    newCandidatesPrevWeek: newCandidatesPrevWeek ?? 0,
    candidatesOverTime,
    sourceBreakdown,
    topAgencies,
    recentCandidates,
    agencyStatuses,
    totalProblems,
  };
}
