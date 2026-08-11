import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agencyId = request.nextUrl.searchParams.get('agency_id');
  const supabase = await createServerClient();

  let query = supabase
    .from('recurring_fulfillment_tasks')
    .select('*')
    .order('due_date', { ascending: true });

  if (agencyId) query = query.eq('agency_id', agencyId);

  const status = request.nextUrl.searchParams.get('status');
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
