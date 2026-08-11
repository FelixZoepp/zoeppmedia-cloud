import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { fetchInsights } from '@/lib/meta/api';

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { data: agencies } = await supabase
    .from('agencies')
    .select('id, meta_ad_account_id')
    .not('meta_ad_account_id', 'is', null);

  if (!agencies?.length) return NextResponse.json({ synced: 0 });

  const since = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const until = new Date().toISOString().split('T')[0];
  let synced = 0;
  const errors: string[] = [];

  for (const agency of agencies) {
    if (!agency.meta_ad_account_id) continue;
    try {
      const insights = await fetchInsights(agency.meta_ad_account_id, since, until);

      for (const row of insights) {
        // Delete existing row for this agency+date first to avoid unique constraint issues,
        // then insert fresh data.
        await supabase
          .from('meta_ad_reports')
          .delete()
          .eq('agency_id', agency.id)
          .eq('report_date', row.date);

        await supabase.from('meta_ad_reports').insert({
          agency_id: agency.id,
          report_date: row.date,
          spend: row.spend,
          impressions: row.impressions,
          clicks: row.clicks,
          leads: row.leads,
          cpl: row.cpl,
          ctr: row.ctr,
          fetched_at: new Date().toISOString(),
        });
      }
      synced++;
    } catch (err) {
      errors.push(
        `${agency.id}: ${err instanceof Error ? err.message : 'unbekannter Fehler'}`
      );
    }
  }

  return NextResponse.json({ synced, errors: errors.length ? errors : undefined });
}
