import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Agency users can only see their own; internal users can query any agency_id
  const paramAgencyId = request.nextUrl.searchParams.get('agency_id');
  const agencyId = isInternal(user.role) && paramAgencyId ? paramAgencyId : user.agency_id;

  if (!agencyId) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('survey_schedule')
    .select('*, survey_templates:template_id(title, description, questions)')
    .eq('agency_id', agencyId)
    .order('scheduled_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
