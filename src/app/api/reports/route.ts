import { getCurrentUser } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function getDateRange(period: string): { since: Date | null; until: Date } {
  const now = new Date();
  switch (period) {
    case 'this_week': {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay() + 1); // Monday
      d.setHours(0, 0, 0, 0);
      return { since: d, until: now };
    }
    case 'this_month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { since: d, until: now };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { since: start, until: end };
    }
    default:
      return { since: null, until: now };
  }
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();

  const { searchParams } = new URL(request.url);
  const agencyId = searchParams.get('agency_id') || currentUser.agency_id;
  const period = searchParams.get('period') || 'all';

  if (!agencyId) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  const { since, until } = getDateRange(period);

  // --- Candidates query with period filter ---
  let candidateQuery = supabase
    .from('candidates')
    .select('id, source, current_stage_id, created_at')
    .eq('agency_id', agencyId);
  if (since) candidateQuery = candidateQuery.gte('created_at', since.toISOString());
  if (period !== 'all') candidateQuery = candidateQuery.lte('created_at', until.toISOString());

  const { data: candidates } = await candidateQuery;

  // Get pipeline stages (not filtered by period)
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, name, sort_order, color')
    .order('sort_order');

  // Build funnel data
  const funnel = (stages || []).map((stage) => ({
    ...stage,
    count: (candidates || []).filter((c) => c.current_stage_id === stage.id).length,
  }));

  // Source breakdown
  const sources = {
    meta: (candidates || []).filter((c) => c.source === 'meta').length,
    indeed: (candidates || []).filter((c) => c.source === 'indeed').length,
    manual: (candidates || []).filter((c) => c.source === 'manual').length,
  };

  // Time-based stats (always relative to now for context, period-filtered candidates)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const total = (candidates || []).length;
  const last30 = (candidates || []).filter((c) => new Date(c.created_at) >= thirtyDaysAgo).length;
  const last7 = (candidates || []).filter((c) => new Date(c.created_at) >= sevenDaysAgo).length;

  // Find "Eingestellt" stage
  const hiredStage = (stages || []).find((s) => s.name === 'Eingestellt');
  const hired = hiredStage ? funnel.find((f) => f.id === hiredStage.id)?.count || 0 : 0;
  const hireRate = total > 0 ? Math.round((hired / total) * 100) : 0;

  // --- Call KPIs ---
  let callQuery = supabase
    .from('call_logs')
    .select('id, result, candidate_id, created_at')
    .eq('agency_id', agencyId);
  if (since) callQuery = callQuery.gte('created_at', since.toISOString());
  if (period !== 'all') callQuery = callQuery.lte('created_at', until.toISOString());

  const { data: calls } = await callQuery;

  const totalCalls = calls?.length || 0;
  const reached = calls?.filter((c) => c.result !== 'nicht_erreicht').length || 0;
  const termine = calls?.filter((c) => c.result === 'termin_vereinbart').length || 0;

  // Compute avg response hours in JS:
  // For each candidate that had at least one call, find time from candidate.created_at to first call.created_at
  let avgResponseHours: number | null = null;
  if (calls && calls.length > 0 && candidates && candidates.length > 0) {
    const candidateMap = new Map((candidates).map((c) => [c.id, c.created_at]));
    // Group calls by candidate_id, find earliest call per candidate
    const firstCallByCandidate = new Map<string, string>();
    for (const call of calls) {
      const existing = firstCallByCandidate.get(call.candidate_id);
      if (!existing || call.created_at < existing) {
        firstCallByCandidate.set(call.candidate_id, call.created_at);
      }
    }
    const deltas: number[] = [];
    for (const [candidateId, firstCallAt] of firstCallByCandidate.entries()) {
      const candidateCreatedAt = candidateMap.get(candidateId);
      if (candidateCreatedAt) {
        const diffMs = new Date(firstCallAt).getTime() - new Date(candidateCreatedAt).getTime();
        if (diffMs >= 0) {
          deltas.push(diffMs / (1000 * 60 * 60)); // convert to hours
        }
      }
    }
    if (deltas.length > 0) {
      const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      avgResponseHours = Math.round(avg * 10) / 10; // 1 decimal place
    }
  }

  const callKpis = {
    totalCalls,
    reachRate: totalCalls > 0 ? Math.round((reached / totalCalls) * 100) : 0,
    terminRate: totalCalls > 0 ? Math.round((termine / totalCalls) * 100) : 0,
    avgResponseHours,
  };

  // --- Meta KPIs ---
  let metaQuery = supabase
    .from('meta_ad_reports')
    .select('spend, leads, cpl, impressions, clicks, report_date')
    .eq('agency_id', agencyId)
    .order('report_date', { ascending: false });

  if (since) metaQuery = metaQuery.gte('report_date', since.toISOString().split('T')[0]);
  if (period !== 'all') metaQuery = metaQuery.lte('report_date', until.toISOString().split('T')[0]);
  else metaQuery = metaQuery.limit(30);

  const { data: metaReports } = await metaQuery;

  const metaKpis =
    metaReports && metaReports.length > 0
      ? {
          totalSpend: metaReports.reduce((s, r) => s + (r.spend || 0), 0),
          totalLeads: metaReports.reduce((s, r) => s + (r.leads || 0), 0),
          avgCpl:
            metaReports.filter((r) => r.cpl !== null).length > 0
              ? metaReports.reduce((s, r) => s + (r.cpl || 0), 0) /
                metaReports.filter((r) => r.cpl !== null).length
              : 0,
          totalImpressions: metaReports.reduce((s, r) => s + (r.impressions || 0), 0),
          totalClicks: metaReports.reduce((s, r) => s + (r.clicks || 0), 0),
        }
      : null;

  return NextResponse.json({
    total,
    last30,
    last7,
    hired,
    hireRate,
    funnel,
    sources,
    callKpis,
    metaKpis,
  });
}
