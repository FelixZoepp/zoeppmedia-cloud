import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Agency info
  const { data: agency } = await admin
    .from('agencies')
    .select('*')
    .eq('id', id)
    .single();

  if (!agency) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // All candidates for this agency
  const { data: candidates } = await admin
    .from('candidates')
    .select('*, current_stage:pipeline_stages(*)')
    .eq('agency_id', id)
    .order('created_at', { ascending: false });

  // Pipeline stages
  const { data: stages } = await admin
    .from('pipeline_stages')
    .select('*')
    .order('sort_order');

  // Funnel: count per stage
  const funnel = stages?.map((s) => ({
    stage: s.name,
    color: s.color,
    count: candidates?.filter((c) => c.current_stage_id === s.id).length || 0,
  }));

  // Source breakdown
  const sourceBreakdown = {
    meta: candidates?.filter((c) => c.source === 'meta').length || 0,
    indeed: candidates?.filter((c) => c.source === 'indeed').length || 0,
    manual: candidates?.filter((c) => c.source === 'manual').length || 0,
  };

  // Last login
  const { data: users } = await admin
    .from('users')
    .select('last_login')
    .eq('agency_id', id)
    .order('last_login', { ascending: false })
    .limit(1);

  const lastLogin = users?.[0]?.last_login || null;

  // Candidates over time (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentCandidates = candidates?.filter(
    (c) => new Date(c.created_at) >= thirtyDaysAgo
  ).length || 0;

  // Upsell signals
  const totalCandidates = candidates?.length || 0;
  const hired = candidates?.filter(
    (c) => c.current_stage && (c.current_stage as { name: string }).name === 'Eingestellt'
  ).length || 0;
  const hireRate = totalCandidates > 0 ? Math.round((hired / totalCandidates) * 100) : 0;

  const daysSinceLogin = lastLogin
    ? Math.floor((Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const upsellSignals: string[] = [];
  if (totalCandidates > 20 && hireRate < 20) {
    upsellSignals.push('Viele Bewerber, niedrige Einstellungsquote — Beratungspotenzial');
  }
  if (daysSinceLogin !== null && daysSinceLogin > 7) {
    upsellSignals.push(`Inaktiv seit ${daysSinceLogin} Tagen — nachfassen`);
  }
  if (recentCandidates > 15) {
    upsellSignals.push('Starkes Wachstum — mehr Services anbieten');
  }

  // KPI + problem + playbook data
  const [{ data: kpiDefaults }, { data: kpiOverrides }, { data: problems }, { data: playbooks }] = await Promise.all([
    admin.from('kpi_defaults').select('*').order('kpi_key'),
    admin.from('agency_kpi_overrides').select('*').eq('agency_id', id),
    admin.from('agency_problems').select('*').eq('agency_id', id).is('resolved_at', null).order('detected_at', { ascending: false }),
    admin.from('playbook_entries').select('*'),
  ]);

  const overrideMap = new Map((kpiOverrides || []).map((o) => [o.kpi_key, o.value]));
  const kpis = (kpiDefaults || []).map((d) => ({
    key: d.kpi_key,
    label: d.label,
    value: overrideMap.has(d.kpi_key) ? overrideMap.get(d.kpi_key)! : d.default_value,
    unit: d.unit,
    direction: d.direction,
    isOverride: overrideMap.has(d.kpi_key),
    defaultValue: d.default_value,
  }));

  return NextResponse.json({
    agency,
    totalCandidates,
    hired,
    hireRate,
    funnel,
    sourceBreakdown,
    lastLogin,
    recentCandidates,
    upsellSignals,
    candidates,
    kpis,
    problems: problems || [],
    playbooks: playbooks || [],
  });
}
