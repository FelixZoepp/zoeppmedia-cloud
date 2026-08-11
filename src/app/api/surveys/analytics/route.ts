import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: responses } = await supabase
    .from('survey_responses')
    .select('agency_id, rating, created_at, agencies:agency_id(name)')
    .order('created_at', { ascending: false });

  if (!responses) {
    return NextResponse.json({ avgRating: 0, total: 0, belowThreshold: [], trend: [] });
  }

  const total = responses.length;
  const avgRating =
    total > 0
      ? Math.round(
          (responses.reduce((s, r) => s + (r.rating ?? 0), 0) / total) * 10,
        ) / 10
      : 0;

  // Per-agency aggregation for threshold detection (avg < 3)
  const byAgency = new Map<string, { ratings: number[]; name: string }>();
  for (const r of responses) {
    const agencyRel = r.agencies as { name: string } | { name: string }[] | null;
    const name = Array.isArray(agencyRel)
      ? (agencyRel[0]?.name ?? 'Unbekannt')
      : (agencyRel?.name ?? 'Unbekannt');
    if (!byAgency.has(r.agency_id)) {
      byAgency.set(r.agency_id, { ratings: [], name });
    }
    byAgency.get(r.agency_id)!.ratings.push(r.rating ?? 0);
  }

  const belowThreshold = Array.from(byAgency.entries())
    .map(([id, { ratings, name }]) => ({
      agency_id: id,
      name,
      avgRating:
        Math.round(
          (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10,
        ) / 10,
    }))
    .filter((a) => a.avgRating < 3);

  // Monthly trend — last 6 months
  const trend: { month: string; avg: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthStr = d.toISOString().slice(0, 7);
    const monthResponses = responses.filter((r) =>
      r.created_at.startsWith(monthStr),
    );
    const avg =
      monthResponses.length > 0
        ? Math.round(
            (monthResponses.reduce((s, r) => s + (r.rating ?? 0), 0) /
              monthResponses.length) *
              10,
          ) / 10
        : 0;
    trend.push({ month: monthStr, avg });
  }

  return NextResponse.json({ avgRating, total, belowThreshold, trend });
}
