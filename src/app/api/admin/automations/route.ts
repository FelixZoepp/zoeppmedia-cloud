import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const agencyId = searchParams.get('agency_id');

  let query = supabase
    .from('automations')
    .select('*')
    .order('created_at', { ascending: false });

  if (agencyId) {
    query = query.or(`agency_id.eq.${agencyId},agency_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();

  const {
    agency_id,
    name,
    description,
    trigger_event,
    conditions,
    actions,
    delay_seconds,
    active,
  } = body;

  if (!name || !trigger_event || !actions) {
    return NextResponse.json(
      { error: 'name, trigger_event und actions sind erforderlich.' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('automations')
    .insert({
      agency_id: agency_id ?? null,
      name,
      description: description ?? null,
      trigger_event,
      conditions: conditions ?? [],
      actions,
      delay_seconds: delay_seconds ?? 0,
      active: active ?? false,
      is_system: false,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
