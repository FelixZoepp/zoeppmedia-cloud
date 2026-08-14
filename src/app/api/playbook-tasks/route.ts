import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const agencyId   = searchParams.get('agency_id');
  const problemId  = searchParams.get('problem_id');
  const assignedTo = searchParams.get('assigned_to');
  const status     = searchParams.get('status');
  const limit      = parseInt(searchParams.get('limit') ?? '50', 10);
  const offset     = parseInt(searchParams.get('offset') ?? '0', 10);

  const supabase = await createServerClient();

  let query = supabase
    .from('playbook_tasks')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (agencyId)   query = query.eq('agency_id', agencyId);
  if (problemId)  query = query.eq('problem_id', problemId);
  if (assignedTo) query = query.eq('assigned_to', assignedTo);
  if (status)     query = query.eq('status', status);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If pagination params were explicitly provided, return paginated shape
  if (searchParams.has('limit') || searchParams.has('offset')) {
    return NextResponse.json({ data: data ?? [], total: count ?? 0 });
  }

  return NextResponse.json(data ?? []);
}
