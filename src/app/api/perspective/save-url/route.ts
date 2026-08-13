import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { agency_id, url } = body;

  if (!agency_id || !url) {
    return NextResponse.json({ error: 'agency_id und url sind erforderlich' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Update or create perspective_funnels entry
  const { data: existingFunnel } = await supabase
    .from('perspective_funnels')
    .select('id')
    .eq('agency_id', agency_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingFunnel) {
    await supabase
      .from('perspective_funnels')
      .update({ url, status: 'published', updated_at: new Date().toISOString() })
      .eq('id', existingFunnel.id);
  } else {
    await supabase
      .from('perspective_funnels')
      .insert({
        agency_id,
        name: 'Recruiting Funnel',
        status: 'published',
        url,
      });
  }

  // Update career_page_url in onboarding_submissions
  await supabase
    .from('onboarding_submissions')
    .update({ career_page_url: url })
    .eq('agency_id', agency_id);

  return NextResponse.json({ ok: true });
}
