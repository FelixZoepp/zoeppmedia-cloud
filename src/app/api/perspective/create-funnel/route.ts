import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { agency_id } = body;

  if (!agency_id) {
    return NextResponse.json({ error: 'agency_id ist erforderlich' }, { status: 400 });
  }

  // Use admin client so service role can bypass RLS
  const supabase = createAdminClient();

  // Get latest onboarding data for funnel content
  const { data: onboarding } = await supabase
    .from('onboarding_submissions')
    .select('company_name')
    .eq('agency_id', agency_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!onboarding) {
    return NextResponse.json(
      { error: 'Onboarding nicht abgeschlossen — kein Datensatz gefunden' },
      { status: 400 }
    );
  }

  const funnelName = `Recruiting Funnel — ${onboarding.company_name || 'Unbekannt'}`;

  // TODO: When Perspective MCP is available at runtime, call create_funnel here
  // and persist the returned perspective_funnel_id + url onto the record below.
  const { data: funnel, error } = await supabase
    .from('perspective_funnels')
    .insert({
      agency_id,
      name: funnelName,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(funnel);
}
