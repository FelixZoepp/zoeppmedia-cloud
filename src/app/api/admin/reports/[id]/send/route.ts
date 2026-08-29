import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isInternalUser } from '@/lib/admin';
import { NextResponse } from 'next/server';
import { sendReportEmail } from '@/lib/email/resend';
import { logActivity } from '@/lib/activity/log';

export async function POST(
  _request: Request,
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

  // Get the report with agency info
  const { data: report } = await admin
    .from('reports')
    .select('*, agencies(id, name, email, contact_name)')
    .eq('id', id)
    .single();

  if (!report) {
    return NextResponse.json({ error: 'Report nicht gefunden' }, { status: 404 });
  }

  if (report.status !== 'freigegeben') {
    return NextResponse.json(
      { error: 'Report muss zuerst freigegeben werden' },
      { status: 400 },
    );
  }

  const agency = report.agencies as { id: string; name: string; email: string; contact_name: string } | null;
  if (!agency?.email) {
    return NextResponse.json(
      { error: 'Keine E-Mail-Adresse fuer diese Agentur hinterlegt' },
      { status: 400 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const dashboardUrl = `${baseUrl}/reports`;

  try {
    await sendReportEmail(
      agency.email,
      report.typ as 'tag_7' | 'tag_14',
      report.daten_json as Record<string, unknown>,
      agency.name,
      dashboardUrl,
    );
  } catch {
    return NextResponse.json({ error: 'E-Mail konnte nicht versendet werden' }, { status: 500 });
  }

  const now = new Date().toISOString();

  const { data, error } = await admin
    .from('reports')
    .update({
      status: 'versendet',
      versendet_am: now,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Status-Update fehlgeschlagen' }, { status: 500 });
  }

  await logActivity(admin, {
    agency_id: report.agency_id,
    user_id: user.id,
    action: `${report.typ === 'tag_7' ? 'Tag-7' : 'Tag-14'} Report an ${agency.email} versendet`,
    action_type: 'report_sent',
    metadata: { report_id: id, typ: report.typ, email: agency.email },
  });

  return NextResponse.json(data);
}
