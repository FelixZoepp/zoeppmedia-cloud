import { getCurrentUser, getEffectiveAgencyId, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getStagesForAgency, istEingestelltStage } from '@/lib/pipeline/get-stages';
import { berlinMonatsStart, berlinWochenStart } from '@/lib/zeit/berlin';

function getDateRange(period: string): { since: Date | null; until: Date } {
  const now = new Date();
  switch (period) {
    // Kalendergrenzen in Berliner Zeit (Montag als Wochenbeginn, auch sonntags)
    case 'this_week':
      return { since: berlinWochenStart(now), until: now };
    case 'this_month':
      return { since: berlinMonatsStart(now), until: now };
    case 'last_month':
      return { since: berlinMonatsStart(now, -1), until: new Date(berlinMonatsStart(now).getTime() - 1) };
    default:
      return { since: null, until: now };
  }
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();

  const { searchParams } = new URL(request.url);
  // agency_id-Parameter nur intern; sonst eigene bzw. geöffnete Kunden-Cloud
  const agencyParam = searchParams.get('agency_id');
  const agencyId = isInternal(currentUser.role) && agencyParam ? agencyParam : await getEffectiveAgencyId();
  const period = searchParams.get('period') || 'all';

  if (!agencyId) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  const { since, until } = getDateRange(period);

  // --- Candidates query with period filter (seitenweise, Supabase kappt sonst bei 1000) ---
  const candidates = await fetchAll<{ id: string; source: string | null; current_stage_id: string | null; created_at: string }>((rFrom, rTo) => {
    let q = supabase
      .from('candidates')
      .select('id, source, current_stage_id, created_at')
      .eq('agency_id', agencyId);
    if (since) q = q.gte('created_at', since.toISOString());
    if (period !== 'all') q = q.lte('created_at', until.toISOString());
    return q.order('id').range(rFrom, rTo);
  });

  // Pipeline der Agentur (eigene Phasen oder globale Standardphasen), nicht nach Zeitraum gefiltert
  const stages = (await getStagesForAgency(supabase, agencyId)).map(({ id, name, sort_order, color, stage_type }) => ({ id, name, sort_order, color, stage_type }));

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
  const hiredIds = new Set(stages.filter(istEingestelltStage).map((s) => s.id));
  const hired = funnel.filter((f) => hiredIds.has(f.id)).reduce((sum, f) => sum + f.count, 0);
  const hireRate = total > 0 ? Math.round((hired / total) * 100) : 0;

  // --- Call KPIs ---
  const calls = await fetchAll<{ id: string; result: string | null; candidate_id: string; created_at: string }>((rFrom, rTo) => {
    let q = supabase
      .from('call_logs')
      .select('id, result, candidate_id, created_at')
      .eq('agency_id', agencyId);
    if (since) q = q.gte('created_at', since.toISOString());
    if (period !== 'all') q = q.lte('created_at', until.toISOString());
    return q.order('id').range(rFrom, rTo);
  });

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
    agencyId,
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
