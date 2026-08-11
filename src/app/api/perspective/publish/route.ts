import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role, agency_id')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { agency_id, funnel_id } = body;

  if (!agency_id) {
    return NextResponse.json({ error: 'agency_id ist erforderlich' }, { status: 400 });
  }

  // Look up the funnel record for this agency
  const { data: funnel, error: funnelError } = await supabase
    .from('perspective_funnels')
    .select('*')
    .eq('agency_id', agency_id)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .maybeSingle();

  // If funnel_id is provided, use that instead
  const targetId = funnel_id || funnel?.perspective_funnel_id;

  if (!targetId) {
    // No draft funnel found — mark as done anyway (funnel may be published externally)
    return NextResponse.json({
      success: true,
      message: 'Kein Draft-Funnel gefunden. Bitte Funnel manuell in Perspective veröffentlichen.',
      published: false,
    });
  }

  if (funnelError) {
    return NextResponse.json({ error: funnelError.message }, { status: 500 });
  }

  // Update local record to published
  if (funnel?.id) {
    await supabase
      .from('perspective_funnels')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', funnel.id);
  }

  return NextResponse.json({
    success: true,
    message: 'Funnel als veröffentlicht markiert.',
    published: true,
    funnel_id: targetId,
  });
}
