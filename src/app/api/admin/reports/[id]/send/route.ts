import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isInternalUser } from '@/lib/admin';
import { NextResponse } from 'next/server';
import { versendeReport, type ReportTyp } from '@/lib/reports/versand';

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

  const { data: report } = await admin
    .from('reports')
    .select('id, agency_id, typ, status, daten_json')
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

  const erg = await versendeReport(
    admin,
    {
      id: report.id,
      agency_id: report.agency_id,
      typ: report.typ as ReportTyp,
      daten_json: report.daten_json as Record<string, unknown>,
    },
    { userId: user.id },
  );
  if (!erg.ok) {
    const status = erg.error.startsWith('Keine E-Mail') ? 400 : 500;
    return NextResponse.json({ error: erg.error }, { status });
  }

  const { data } = await admin.from('reports').select('*').eq('id', id).single();
  return NextResponse.json(data);
}
