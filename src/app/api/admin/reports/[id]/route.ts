import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isInternalUser } from '@/lib/admin';
import { NextResponse } from 'next/server';
import { logActivity } from '@/lib/activity/log';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerClient();
  if (!(await isInternalUser(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('reports')
    .select('*, agencies(id, name, email, contact_name)')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Report nicht gefunden' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerClient();
  if (!(await isInternalUser(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get the report
  const { data: report } = await admin
    .from('reports')
    .select('id, status, agency_id, typ')
    .eq('id', id)
    .single();

  if (!report) {
    return NextResponse.json({ error: 'Report nicht gefunden' }, { status: 404 });
  }

  if (report.status !== 'generiert') {
    return NextResponse.json(
      { error: 'Report kann nur im Status "generiert" freigegeben werden' },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  const { data, error } = await admin
    .from('reports')
    .update({
      status: 'freigegeben',
      freigegeben_von: user.id,
      freigegeben_am: now,
    })
    .eq('id', id)
    .select('*, agencies(id, name)')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Freigabe fehlgeschlagen' }, { status: 500 });
  }

  await logActivity(admin, {
    agency_id: report.agency_id,
    user_id: user.id,
    action: `${report.typ === 'tag_7' ? 'Tag-7' : 'Tag-14'} Report freigegeben`,
    action_type: 'report_approved',
    metadata: { report_id: id, typ: report.typ },
  });

  return NextResponse.json(data);
}
