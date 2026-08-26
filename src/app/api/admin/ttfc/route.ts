import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isInternalUser } from '@/lib/admin';

export async function GET() {
  const supabase = await createServerClient();
  const internal = await isInternalUser(supabase);
  if (!internal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch TTFC stats per agency from the view
  const { data: stats, error: statsError } = await admin
    .from('ttfc_stats')
    .select('*');

  if (statsError) {
    return NextResponse.json({ error: statsError.message }, { status: 500 });
  }

  // Fetch agency names for mapping
  const agencyIds = (stats ?? []).map((s: { agency_id: string }) => s.agency_id);
  const { data: agencies } = await admin
    .from('agencies')
    .select('id, name')
    .in('id', agencyIds);

  const agencyMap: Record<string, string> = {};
  for (const a of agencies ?? []) {
    agencyMap[a.id] = a.name;
  }

  // Calculate overall stats by summing across agencies
  const overall = {
    total: 0,
    contacted: 0,
    avg_ttfc_seconds: 0,
    median_ttfc_seconds: 0,
    p90_ttfc_seconds: 0,
    under_15min: 0,
    under_4h: 0,
    over_4h: 0,
  };

  const byAgency = (stats ?? []).map((s: {
    agency_id: string;
    total_candidates: number;
    dialed: number;
    contacted: number;
    avg_time_to_first_dial: number | null;
    avg_ttfc: number | null;
    median_ttfc: number | null;
    p90_ttfc: number | null;
    under_15min: number;
    under_4h: number;
    over_4h: number;
  }) => {
    overall.total += Number(s.total_candidates) || 0;
    overall.contacted += Number(s.contacted) || 0;
    overall.under_15min += Number(s.under_15min) || 0;
    overall.under_4h += Number(s.under_4h) || 0;
    overall.over_4h += Number(s.over_4h) || 0;

    return {
      agency_id: s.agency_id,
      agency_name: agencyMap[s.agency_id] ?? 'Unbekannt',
      total: Number(s.total_candidates) || 0,
      dialed: Number(s.dialed) || 0,
      contacted: Number(s.contacted) || 0,
      avg_time_to_first_dial_seconds: s.avg_time_to_first_dial != null ? Number(s.avg_time_to_first_dial) : null,
      avg_ttfc_seconds: s.avg_ttfc != null ? Number(s.avg_ttfc) : null,
      median_ttfc_seconds: s.median_ttfc != null ? Math.round(Number(s.median_ttfc)) : null,
      p90_ttfc_seconds: s.p90_ttfc != null ? Math.round(Number(s.p90_ttfc)) : null,
      under_15min: Number(s.under_15min) || 0,
      under_4h: Number(s.under_4h) || 0,
      over_4h: Number(s.over_4h) || 0,
    };
  });

  // Compute overall averages from raw candidate data (more accurate than averaging averages)
  const { data: overallStats } = await admin
    .from('candidates')
    .select('first_contact_at, created_at')
    .not('first_contact_at', 'is', null)
    .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

  if (overallStats && overallStats.length > 0) {
    const ttfcValues = overallStats
      .map((c: { first_contact_at: string; created_at: string }) => {
        return (new Date(c.first_contact_at).getTime() - new Date(c.created_at).getTime()) / 1000;
      })
      .sort((a: number, b: number) => a - b);

    const sum = ttfcValues.reduce((acc: number, v: number) => acc + v, 0);
    overall.avg_ttfc_seconds = Math.round(sum / ttfcValues.length);

    const midIdx = Math.floor(ttfcValues.length / 2);
    overall.median_ttfc_seconds = ttfcValues.length % 2 === 0
      ? Math.round((ttfcValues[midIdx - 1] + ttfcValues[midIdx]) / 2)
      : Math.round(ttfcValues[midIdx]);

    const p90Idx = Math.floor(ttfcValues.length * 0.9);
    overall.p90_ttfc_seconds = Math.round(ttfcValues[Math.min(p90Idx, ttfcValues.length - 1)]);
  }

  return NextResponse.json({
    overall,
    by_agency: byAgency,
  });
}
