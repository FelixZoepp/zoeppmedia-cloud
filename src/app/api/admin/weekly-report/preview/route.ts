import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isInternalUser } from '@/lib/admin';
import { generateWeeklyReportData } from '@/lib/email/weekly-report-data';
import { generateWeeklyReportEmail } from '@/lib/email/weekly-report-template';

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const internal = await isInternalUser(supabase);
  if (!internal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agencyId = request.nextUrl.searchParams.get('agency_id');
  if (!agencyId) {
    return NextResponse.json({ error: 'agency_id parameter required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';

  try {
    const data = await generateWeeklyReportData(admin, agencyId);
    const html = generateWeeklyReportEmail({
      ...data,
      dashboard_url: `${appUrl}/dashboard`,
    });

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
