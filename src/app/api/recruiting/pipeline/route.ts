import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateRecruitingKpis } from '@/lib/recruiting/kpis';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/recruiting/pipeline?agency_id=xxx
 *
 * Returns the recruiting pipeline, stages, and KPIs for the current user's agency.
 * Admins/employees can query any agency by passing agency_id.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agencyIdParam = request.nextUrl.searchParams.get('agency_id');

  let agencyId: string | null;
  if (isInternal(user.role) && agencyIdParam) {
    agencyId = agencyIdParam;
  } else {
    agencyId = user.agency_id;
  }

  if (!agencyId) {
    return NextResponse.json({ error: 'Keine Agentur zugeordnet' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get pipeline
  const { data: pipeline } = await admin
    .from('recruiting_pipelines')
    .select('*')
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!pipeline) {
    return NextResponse.json({
      pipeline: null,
      stages: [],
      kpis: null,
      message: 'Keine Recruiting-Pipeline für diese Agentur konfiguriert',
    });
  }

  // Get stages
  const { data: stages } = await admin
    .from('recruiting_stages')
    .select('*')
    .eq('pipeline_id', pipeline.id)
    .order('reihenfolge', { ascending: true });

  // Calculate KPIs
  const fromParam = request.nextUrl.searchParams.get('from');
  const toParam = request.nextUrl.searchParams.get('to');

  const period =
    fromParam && toParam ? { from: fromParam, to: toParam } : undefined;

  const kpis = await calculateRecruitingKpis(admin, agencyId, period);

  return NextResponse.json({
    pipeline,
    stages: stages ?? [],
    kpis,
  });
}
