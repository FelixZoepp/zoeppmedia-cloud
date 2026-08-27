import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isInternalUser } from '@/lib/admin';
import { logActivity } from '@/lib/activity/log';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  if (!(await isInternalUser(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Get agency video settings
  const { data: agency } = await admin
    .from('agencies')
    .select('dankevideo_url, dankevideo_active')
    .eq('id', id)
    .single();

  if (!agency) {
    return NextResponse.json({ error: 'Agentur nicht gefunden' }, { status: 404 });
  }

  // Get view stats
  const { data: views } = await admin
    .from('video_views')
    .select('id, viewed_at')
    .eq('agency_id', id);

  const totalLinks = views?.length || 0;
  const totalViews = views?.filter((v) => v.viewed_at !== null).length || 0;
  const viewRate = totalLinks > 0 ? Math.round((totalViews / totalLinks) * 100) : 0;

  return NextResponse.json({
    dankevideo_url: agency.dankevideo_url,
    dankevideo_active: agency.dankevideo_active,
    total_links: totalLinks,
    total_views: totalViews,
    view_rate: viewRate,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  if (!(await isInternalUser(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if ('dankevideo_url' in body) {
    updates.dankevideo_url = body.dankevideo_url || null;
  }
  if ('dankevideo_active' in body) {
    updates.dankevideo_active = !!body.dankevideo_active;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: agency, error } = await admin
    .from('agencies')
    .update(updates)
    .eq('id', id)
    .select('dankevideo_url, dankevideo_active')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 });
  }

  await logActivity(admin, {
    agency_id: id,
    action: 'Dankevideo-Einstellungen aktualisiert',
    action_type: 'dankevideo_updated',
    metadata: updates,
  });

  return NextResponse.json(agency);
}
