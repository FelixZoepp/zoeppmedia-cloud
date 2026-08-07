import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('agency_id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const agencyId = searchParams.get('agency_id') || profile.agency_id;

  if (!agencyId) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  // Get candidates for this agency
  const { data: candidates } = await supabase
    .from('candidates')
    .select('id, source, current_stage_id, created_at')
    .eq('agency_id', agencyId);

  // Get pipeline stages
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

  // Time-based stats
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

  return NextResponse.json({
    total,
    last30,
    last7,
    hired,
    hireRate,
    funnel,
    sources,
  });
}
