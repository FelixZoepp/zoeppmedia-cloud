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
    .from('agency_problems')
    .select('*')
    .is('resolved_at', null)
    .order('detected_at', { ascending: false });

  if (agencyId) query = query.eq('agency_id', agencyId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
