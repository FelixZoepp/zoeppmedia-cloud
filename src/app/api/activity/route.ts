import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agency_id = searchParams.get('agency_id');
  const candidate_id = searchParams.get('candidate_id');
  const action_type = searchParams.get('action_type');
  const limit = Math.min(Number(searchParams.get('limit') || '50'), 200);
  const offset = Number(searchParams.get('offset') || '0');

  let query = supabase
    .from('activity_log')
    .select('*, user:users(name)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (agency_id) query = query.eq('agency_id', agency_id);
  if (candidate_id) query = query.eq('candidate_id', candidate_id);
  if (action_type) query = query.eq('action_type', action_type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
