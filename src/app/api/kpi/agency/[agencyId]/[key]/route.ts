import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ agencyId: string; key: string }> }) {
  const { agencyId, key } = await params;
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { value } = await request.json();
  if (typeof value !== 'number') return NextResponse.json({ error: 'Value must be a number' }, { status: 400 });

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('agency_kpi_overrides')
    .upsert({ agency_id: agencyId, kpi_key: key, value, set_by: user.id }, { onConflict: 'agency_id,kpi_key' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ agencyId: string; key: string }> }) {
  const { agencyId, key } = await params;
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('agency_kpi_overrides')
    .delete()
    .eq('agency_id', agencyId)
    .eq('kpi_key', key);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
