import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('agency_id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Determine agency ID: use query param for admins, otherwise own agency
  const searchParams = request.nextUrl.searchParams;
  const requestedAgencyId = searchParams.get('agencyId');
  const isInternal = profile.role === 'admin' || profile.role === 'employee';
  const agencyId = isInternal && requestedAgencyId ? requestedAgencyId : profile.agency_id;

  if (!agencyId) {
    return NextResponse.json({ totalCandidates: 0 });
  }

  // Get SLA target from kpi_defaults (with possible agency override)
  let slaHours = 24;
  const { data: kpiDefault } = await supabase
    .from('kpi_defaults')
    .select('default_value')
    .eq('kpi_key', 'max_response_hours')
    .single();

  if (kpiDefault) {
    slaHours = Number(kpiDefault.default_value);
  }

  // Check for agency-specific override
  const { data: kpiOverride } = await supabase
    .from('agency_kpi_overrides')
    .select('value')
    .eq('agency_id', agencyId)
    .eq('kpi_key', 'max_response_hours')
    .single();

  if (kpiOverride) {
    slaHours = Number(kpiOverride.value);
  }

  const slaSeconds = slaHours * 3600;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 3600 * 1000);

  // Current period: last 30 days
  const { data: currentCandidates } = await supabase
    .from('candidates')
    .select('id, ttfc_seconds, created_at')
    .eq('agency_id', agencyId)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .not('ttfc_seconds', 'is', null);

  // Previous period: 30-60 days ago
  const { data: previousCandidates } = await supabase
    .from('candidates')
    .select('id, ttfc_seconds')
    .eq('agency_id', agencyId)
    .gte('created_at', sixtyDaysAgo.toISOString())
    .lt('created_at', thirtyDaysAgo.toISOString())
    .not('ttfc_seconds', 'is', null);

  // Total candidates (to show empty state)
  const { count: totalCandidates } = await supabase
    .from('candidates')
    .select('*', { count: 'exact', head: true })
    .eq('agency_id', agencyId);

  // Calculate current period stats
  const currentTtfcValues = (currentCandidates ?? [])
    .map((c) => c.ttfc_seconds as number)
    .sort((a, b) => a - b);

  let medianTtfcSeconds: number | null = null;
  let withinSlaPercent = 0;

  if (currentTtfcValues.length > 0) {
    // Median
    const mid = Math.floor(currentTtfcValues.length / 2);
    medianTtfcSeconds =
      currentTtfcValues.length % 2 === 0
        ? Math.round((currentTtfcValues[mid - 1] + currentTtfcValues[mid]) / 2)
        : currentTtfcValues[mid];

    // Within SLA percentage
    const withinSla = currentTtfcValues.filter((t) => t <= slaSeconds).length;
    withinSlaPercent = Math.round((withinSla / currentTtfcValues.length) * 100);
  }

  // Streak: last 10 candidates with ttfc, how many are within SLA
  const { data: lastTenCandidates } = await supabase
    .from('candidates')
    .select('ttfc_seconds')
    .eq('agency_id', agencyId)
    .not('ttfc_seconds', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  let streak = 0;
  for (const c of lastTenCandidates ?? []) {
    if ((c.ttfc_seconds as number) <= slaSeconds) {
      streak++;
    }
  }

  // Previous period stats
  let previousWithinSlaPercent: number | null = null;
  const previousTtfcValues = (previousCandidates ?? []).map(
    (c) => c.ttfc_seconds as number
  );

  if (previousTtfcValues.length > 0) {
    const withinSla = previousTtfcValues.filter((t) => t <= slaSeconds).length;
    previousWithinSlaPercent = Math.round(
      (withinSla / previousTtfcValues.length) * 100
    );
  }

  return NextResponse.json({
    medianTtfcSeconds,
    withinSlaPercent,
    slaHours,
    streak,
    previousWithinSlaPercent,
    totalCandidates: totalCandidates ?? 0,
  });
}
