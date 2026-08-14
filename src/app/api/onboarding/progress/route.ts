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

  const url = new URL(req.url);
  const agencyIdParam = url.searchParams.get('agency_id');

  // Internal users can query any agency by passing ?agency_id=X
  const isInternal = profile.role === 'admin' || profile.role === 'employee';
  const targetAgencyId =
    isInternal && agencyIdParam ? agencyIdParam : profile.agency_id;

  if (!targetAgencyId) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  const { data, error } = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('agency_id', targetAgencyId)
    .order('step_number', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('agency_id')
    .eq('id', user.id)
    .single();

  if (!profile?.agency_id) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  const body = await req.json() as {
    step_number: number;
    step_name: string;
    started_at?: string;
    completed_at?: string;
    time_spent_seconds?: number;
  };

  const { step_number, step_name, started_at, completed_at, time_spent_seconds } = body;

  if (typeof step_number !== 'number' || !step_name) {
    return NextResponse.json({ error: 'step_number and step_name are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('onboarding_progress')
    .upsert(
      {
        agency_id: profile.agency_id,
        user_id: user.id,
        step_number,
        step_name,
        ...(started_at !== undefined && { started_at }),
        ...(completed_at !== undefined && { completed_at }),
        ...(time_spent_seconds !== undefined && { time_spent_seconds }),
      },
      { onConflict: 'agency_id,step_number', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
