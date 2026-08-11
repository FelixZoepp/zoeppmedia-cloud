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

  // Total agencies
  const { count: totalAgencies } = await admin
    .from('agencies')
    .select('*', { count: 'exact', head: true });

  const { count: agenciesPrevWeek } = await admin
    .from('agencies')
    .select('*', { count: 'exact', head: true })
    .lt('created_at', endOfPrevWeek.toISOString());

  // Total candidates
  const { count: totalCandidates } = await admin
    .from('candidates')
    .select('*', { count: 'exact', head: true });

  const { count: candidatesPrevWeek } = await admin
    .from('candidates')
    .select('*', { count: 'exact', head: true })
    .lt('created_at', endOfPrevWeek.toISOString());

  // New this week
  const { count: newCandidatesThisWeek } = await admin
    .from('candidates')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startOfWeek.toISOString());

  const { count: newCandidatesPrevWeek } = await admin
    .from('candidates')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startOfPrevWeek.toISOString())
    .lt('created_at', endOfPrevWeek.toISOString());

  // Hired
  const { data: hiredStage } = await admin
    .from('pipeline_stages')
    .select('id')
    .eq('name', 'Eingestellt')
    .single();

  const hiredStageId = hiredStage?.id;

  const { count: totalHired } = hiredStageId
    ? await admin.from('candidates').select('*', { count: 'exact', head: true }).eq('current_stage_id', hiredStageId)
    : { count: 0 };

  const { count: hiredPrevWeek } = hiredStageId
    ? await admin
        .from('candidate_stages')
        .select('*', { count: 'exact', head: true })
        .eq('stage_id', hiredStageId)
        .gte('changed_at', startOfPrevWeek.toISOString())
        .lt('changed_at', endOfPrevWeek.toISOString())
    : { count: 0 };

  // Candidates over time (last 6 months)
  const candidatesOverTime: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const label = d.toLocaleDateString('de-DE', { month: 'short' });

    const { count } = await admin
      .from('candidates')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', d.toISOString())
      .lt('created_at', nextMonth.toISOString());

    candidatesOverTime.push({ month: label, count: count ?? 0 });
  }

  // Source breakdown
  const { data: allCandidates } = await admin.from('candidates').select('source');
  const sourceCounts: Record<string, number> = { meta: 0, indeed: 0, manual: 0 };
  (allCandidates ?? []).forEach((c) => {
    sourceCounts[c.source] = (sourceCounts[c.source] || 0) + 1;
  });
  const sourceLabels: Record<string, string> = { meta: 'Meta Ads', indeed: 'Indeed', manual: 'Manuell' };
  const sourceBreakdown = Object.entries(sourceCounts).map(([key, count]) => ({
    name: sourceLabels[key] || key,
    count,
  }));

  // Agency problem statuses (traffic light)
  const allAgencies_raw = await admin.from('agencies').select('id, name');
  const allAgencies = allAgencies_raw.data;

  const { data: allProblems } = await admin
    .from('agency_problems')
    .select('agency_id, severity')
    .is('resolved_at', null);

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
  const { data: agencies } = await admin.from('agencies').select('id, name');
  const { data: candidatesByAgency } = await admin.from('candidates').select('agency_id, current_stage_id');

  const agencyMap: Record<string, { candidates: number; hired: number }> = {};
  (candidatesByAgency ?? []).forEach((c) => {
    if (!agencyMap[c.agency_id]) agencyMap[c.agency_id] = { candidates: 0, hired: 0 };
    agencyMap[c.agency_id].candidates++;
    if (hiredStageId && c.current_stage_id === hiredStageId) agencyMap[c.agency_id].hired++;
  });

  const topAgencies = (agencies ?? [])
    .map((a) => ({
      id: a.id,
      name: a.name,
      candidates: agencyMap[a.id]?.candidates ?? 0,
      hired: agencyMap[a.id]?.hired ?? 0,
    }))
    .sort((a, b) => b.candidates - a.candidates)
    .slice(0, 5);

  // Recent candidates with agency name
  const { data: recent } = await admin
    .from('candidates')
    .select('id, name, source, created_at, agency_id')
    .order('created_at', { ascending: false })
    .limit(5);

  const agencyNames: Record<string, string> = {};
  (agencies ?? []).forEach((a) => { agencyNames[a.id] = a.name; });

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
