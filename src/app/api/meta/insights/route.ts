import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { fetchInsights } from '@/lib/meta/api';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const agencyId = searchParams.get('agency_id') || user.agency_id;
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 400 });

  const supabase = await createServerClient();
  const { data: agency } = await supabase
    .from('agencies')
    .select('meta_ad_account_id')
    .eq('id', agencyId)
    .single();

  if (!agency?.meta_ad_account_id) {
    return NextResponse.json({ error: 'Meta nicht verbunden' }, { status: 400 });
  }

  const since =
    searchParams.get('since') ||
    new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const until = searchParams.get('until') || new Date().toISOString().split('T')[0];

  try {
    const insights = await fetchInsights(agency.meta_ad_account_id, since, until);
    return NextResponse.json(insights);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Meta API Fehler' },
      { status: 500 }
    );
  }
}
