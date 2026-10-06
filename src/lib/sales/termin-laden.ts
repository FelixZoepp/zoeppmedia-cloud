import { createAdminClient } from '@/lib/supabase/admin';
import { SALES_AGENCY_ID } from './calendly-chain';
import { terminArt, type SalesTermin } from './termin-kalender';

/** Sales-Termin über die Calendly-Event-ID (steckt im Kalender-Button der WhatsApp-Vorlage) */
export async function ladeSalesTermin(id: string): Promise<(SalesTermin & { vorname: string; abgesagt: boolean }) | null> {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return null;
  const { data } = await createAdminClient()
    .from('calendly_events')
    .select('calendly_event_id, event_type, event_name, start_time, end_time, invitee_name, status')
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('calendly_event_id', id)
    .maybeSingle();
  if (!data) return null;
  const e = data as { calendly_event_id: string; event_type: string | null; event_name: string | null; start_time: string; end_time: string | null; invitee_name: string | null; status: string | null };
  const art = terminArt(e.event_type, e.event_name);
  const ende = e.end_time ?? new Date(new Date(e.start_time).getTime() + (art === 'beratung' ? 60 : 15) * 60_000).toISOString();
  return {
    id: e.calendly_event_id,
    art,
    start: e.start_time,
    ende,
    vorname: (e.invitee_name ?? '').split(/\s+/)[0] ?? '',
    abgesagt: e.status === 'canceled' || e.status === 'cancelled',
  };
}
