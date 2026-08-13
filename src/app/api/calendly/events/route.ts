import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { searchParams } = new URL(request.url);

  const agencyId = searchParams.get('agency_id');
  const candidateId = searchParams.get('candidate_id');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  let query = supabase
    .from('calendly_events')
    .select('*')
    .order('start_time', { ascending: true })
    .limit(limit);

  if (agencyId) {
    query = query.eq('agency_id', agencyId);
  }

  if (candidateId) {
    query = query.eq('candidate_id', candidateId);
  }

  if (from) {
    query = query.gte('start_time', from);
  }

  if (to) {
    query = query.lte('start_time', to);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
