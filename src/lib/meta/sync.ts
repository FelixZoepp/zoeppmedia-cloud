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

      if (insights.length) {
        const { error } = await supabase.from('meta_ad_reports').upsert(
          insights.map((row) => ({
            agency_id: agency.id,
            report_date: row.date,
            spend: row.spend,
            impressions: row.impressions,
            clicks: row.clicks,
            leads: row.leads,
            cpl: row.cpl,
            ctr: row.ctr,
            fetched_at: now.toISOString(),
          })),
          { onConflict: 'agency_id,report_date' },
        );
        if (error) throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
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

  // 7 Kalendertage inkl. heute – für Meta-Tageswerte und Kandidaten/Anrufe dasselbe Fenster
  const now = new Date();
  const periodEnd = now.toISOString().split('T')[0];
  const periodStart = new Date(now.getTime() - 6 * 86400000).toISOString().split('T')[0];
  const sevenDaysAgoIso = `${periodStart}T00:00:00.000Z`;

  let written = 0;

  for (const agency of agencies) {
    try {
      const callsBase = () =>
        supabase
          .from('call_logs')
          .select('id', { count: 'exact', head: true })
          .eq('agency_id', agency.id)
          .gte('created_at', sevenDaysAgoIso);
      const [metaResult, candidatesResult, callsResult, reachedResult, termineResult] = await Promise.all([
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
        callsBase(),
        callsBase().or('result.is.null,result.neq.nicht_erreicht'),
        callsBase().eq('result', 'termin_vereinbart'),
      ]);
      const fehler = [metaResult, candidatesResult, callsResult, reachedResult, termineResult].find((r) => r.error)?.error;
      if (fehler) throw new Error(fehler.message);

      const metaRows = metaResult.data ?? [];
      const spend = metaRows.reduce((s, r) => s + (r.spend || 0), 0);
      const impressions = metaRows.reduce((s, r) => s + (r.impressions || 0), 0);
      const clicks = metaRows.reduce((s, r) => s + (r.clicks || 0), 0);
      const leads = metaRows.reduce((s, r) => s + (r.leads || 0), 0);

      const callCount = callsResult.count ?? 0;
      const reached = reachedResult.count ?? 0;
      const termine = termineResult.count ?? 0;

      const data: KpiSnapshotData = {
        spend: Math.round(spend * 100) / 100,
        impressions,
        clicks,
        leads,
        cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : 0,
        ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
        candidates: candidatesResult.count ?? 0,
        calls: callCount,
        reached,
        termine,
        reach_rate: callCount > 0 ? Math.round((reached / callCount) * 100) : 0,
        termin_rate: callCount > 0 ? Math.round((termine / callCount) * 100) : 0,
      };

      // Ein Snapshot pro Agentur+Periode: bestehenden für heute ersetzen
      const { error: delError } = await supabase
        .from('report_snapshots')
        .delete()
        .eq('agency_id', agency.id)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd);
      if (delError) throw new Error(delError.message);

      const { error: insError } = await supabase.from('report_snapshots').insert({
        agency_id: agency.id,
        period_start: periodStart,
        period_end: periodEnd,
        data,
      });
      if (insError) throw new Error(insError.message);

      written++;
    } catch {
      /* silent — einzelne Agentur blockiert nicht den Rest */
    }
  }

  return written;
}
