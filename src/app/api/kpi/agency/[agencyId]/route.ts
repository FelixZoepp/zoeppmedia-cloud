import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ agencyId: string }> }) {
  const { agencyId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Agency users can see their own KPIs, internal can see all
  if (!isInternal(user.role) && user.agency_id !== agencyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createServerClient();
  const [{ data: defaults }, { data: overrides }] = await Promise.all([
    supabase.from('kpi_defaults').select('*').order('kpi_key'),
    supabase.from('agency_kpi_overrides').select('*').eq('agency_id', agencyId),
  ]);

  const overrideMap = new Map((overrides || []).map((o) => [o.kpi_key, o.value]));

  const effective = (defaults || []).map((d) => ({
    key: d.kpi_key,
    label: d.label,
    value: overrideMap.has(d.kpi_key) ? overrideMap.get(d.kpi_key)! : d.default_value,
    unit: d.unit,
    direction: d.direction,
    isOverride: overrideMap.has(d.kpi_key),
    defaultValue: d.default_value,
  }));

  return NextResponse.json(effective);
}
