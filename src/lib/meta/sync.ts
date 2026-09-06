import { SupabaseClient } from '@supabase/supabase-js';
import { fetchInsights } from '@/lib/meta/api';

export interface MetaSyncResult {
  synced: number;
  errors: string[];
}

/**
 * Synchronisiert Meta-Insights (letzte 7 Tage) für alle Agenturen mit
 * hinterlegtem meta_ad_account_id in die Tabelle meta_ad_reports.
 * Gemeinsam genutzt von /api/meta/sync-insights (manuell) und /api/cron/daily.
 */
export async function syncMetaInsights(supabase: SupabaseClient): Promise<MetaSyncResult> {
  const result: MetaSyncResult = { synced: 0, errors: [] };

  if (!process.env.META_SYSTEM_USER_TOKEN) {
    result.errors.push('META_SYSTEM_USER_TOKEN nicht konfiguriert');
    return result;
  }

  const { data: agencies } = await supabase
    .from('agencies')
    .select('id, meta_ad_account_id')
    .not('meta_ad_account_id', 'is', null);

  if (!agencies?.length) return result;

  const now = new Date();
  const since = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
  const until = now.toISOString().split('T')[0];

  for (const agency of agencies) {
    if (!agency.meta_ad_account_id) continue;
    try {
      const insights = await fetchInsights(agency.meta_ad_account_id, since, until);

      for (const row of insights) {
        // Delete + Insert statt Upsert, um Unique-Constraint-Konflikte
        // (agency_id, report_date) sauber zu behandeln.
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
          fetched_at: now.toISOString(),
        });
      }
      result.synced++;
    } catch (err) {
      result.errors.push(
        `${agency.id}: ${err instanceof Error ? err.message : 'unbekannter Fehler'}`
      );
    }
  }

  return result;
}

export interface KpiSnapshotData {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number;
  ctr: number;
  candidates: number;
  calls: number;
  reached: number;
  termine: number;
  reach_rate: number;
  termin_rate: number;
  [key: string]: number;
}

/**
 * Schreibt pro Agentur einen standardisierten 7-Tage-KPI-Snapshot in
 * report_snapshots. Dashboards und Reports lesen so einheitliche Zahlen,
 * statt sie jeweils neu (und leicht unterschiedlich) zu berechnen.
 * Ein Snapshot pro Agentur und Tag (bestehender wird ersetzt).
 */
export async function writeKpiSnapshots(supabase: SupabaseClient): Promise<number> {
  const { data: agencies } = await supabase.from('agencies').select('id');
  if (!agencies?.length) return 0;

  const now = new Date();
  const periodEnd = now.toISOString().split('T')[0];
  const periodStart = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
  const sevenDaysAgoIso = new Date(now.getTime() - 7 * 86400000).toISOString();

  let written = 0;

  for (const agency of agencies) {
    try {
      const [metaResult, candidatesResult, callsResult] = await Promise.all([
        supabase
          .from('meta_ad_reports')
          .select('spend, impressions, clicks, leads')
          .eq('agency_id', agency.id)
          .gte('report_date', periodStart)
          .lte('report_date', periodEnd),
        supabase
          .from('candidates')
          .select('id', { count: 'exact', head: true })
          .eq('agency_id', agency.id)
          .gte('created_at', sevenDaysAgoIso),
        supabase
          .from('call_logs')
          .select('result')
          .eq('agency_id', agency.id)
          .gte('created_at', sevenDaysAgoIso),
      ]);

      const metaRows = metaResult.data ?? [];
      const spend = metaRows.reduce((s, r) => s + (r.spend || 0), 0);
      const impressions = metaRows.reduce((s, r) => s + (r.impressions || 0), 0);
      const clicks = metaRows.reduce((s, r) => s + (r.clicks || 0), 0);
      const leads = metaRows.reduce((s, r) => s + (r.leads || 0), 0);

      const calls = callsResult.data ?? [];
      const reached = calls.filter((c) => c.result !== 'nicht_erreicht').length;
      const termine = calls.filter((c) => c.result === 'termin_vereinbart').length;

      const data: KpiSnapshotData = {
        spend: Math.round(spend * 100) / 100,
        impressions,
        clicks,
        leads,
        cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : 0,
        ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
        candidates: candidatesResult.count ?? 0,
        calls: calls.length,
        reached,
        termine,
        reach_rate: calls.length > 0 ? Math.round((reached / calls.length) * 100) : 0,
        termin_rate: calls.length > 0 ? Math.round((termine / calls.length) * 100) : 0,
      };

      // Ein Snapshot pro Agentur+Periode: bestehenden für heute ersetzen
      await supabase
        .from('report_snapshots')
        .delete()
        .eq('agency_id', agency.id)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd);

      await supabase.from('report_snapshots').insert({
        agency_id: agency.id,
        period_start: periodStart,
        period_end: periodEnd,
        data,
      });

      written++;
    } catch {
      /* silent — einzelne Agentur blockiert nicht den Rest */
    }
  }

  return written;
}
