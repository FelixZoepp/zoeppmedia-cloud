import { SupabaseClient } from '@supabase/supabase-js';
import { createNotificationForAgency } from '@/lib/notifications/create';

export function shouldAlertFeed(polls: number, apps: number): boolean {
  return polls > 0 && apps === 0;
}

export function shouldAlertErrorRate(failed: number, total: number): boolean {
  return total >= 20 && failed / total > 0.01;
}

/** Täglicher Check der Eingänge (Spec §5 Monitoring). */
export async function runIngestMonitor(svc: SupabaseClient): Promise<{ feedAlerts: number; errorRateAlerts: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let feedAlerts = 0;
  let errorRateAlerts = 0;

  const { data: agencies } = await svc.from('agencies').select('id, name');
  for (const agency of agencies ?? []) {
    // 1. Feed-Abrufe ohne Bewerbungen
    const { count: polls } = await svc
      .from('feed_polls')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agency.id)
      .gte('polled_at', since);
    const { count: apps } = await svc
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agency.id)
      .eq('source', 'indeed')
      .gte('created_at', since);
    if (shouldAlertFeed(polls ?? 0, apps ?? 0)) {
      feedAlerts++;
      await createNotificationForAgency(svc, agency.id, {
        title: 'Indeed-Feed ohne Bewerbungen',
        body: `In den letzten 24 Stunden gab es ${polls} Feed-Abrufe, aber keine Indeed-Bewerbung. Bitte Feed und Freigabestatus prüfen.`,
        type: 'system',
        push_url: '/settings/quellen',
      }).catch((e) => console.error('[ingest-monitor] Notification fehlgeschlagen', e));
    }

    // 2. Fehlerquote der Ingest-Events (status 'failed' und 'dead' — beide im Schema vorhanden)
    const { count: total } = await svc
      .from('events_inbox')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agency.id)
      .in('source', ['indeed', 'meta', 'generic'])
      .gte('received_at', since);
    const { count: failed } = await svc
      .from('events_inbox')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agency.id)
      .in('source', ['indeed', 'meta', 'generic'])
      .in('status', ['failed', 'dead'])
      .gte('received_at', since);
    if (shouldAlertErrorRate(failed ?? 0, total ?? 0)) {
      errorRateAlerts++;
      await createNotificationForAgency(svc, agency.id, {
        title: 'Fehlerquote im Bewerbungseingang über 1 %',
        body: `${failed} von ${total} Eingangs-Events der letzten 24 Stunden sind fehlgeschlagen.`,
        type: 'system',
        push_url: '/settings/quellen',
      }).catch((e) => console.error('[ingest-monitor] Notification fehlgeschlagen', e));
    }
  }
  return { feedAlerts, errorRateAlerts };
}
