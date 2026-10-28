import type { SupabaseClient } from '@supabase/supabase-js';
import { KUNDEN_ROLLEN } from '@/lib/agency-team/access';
import { werteStartklarAus, type Startklar, type StartklarRohdaten } from './schritte';

export { werteStartklarAus, istDeutscheNummer } from './schritte';
export type { Startklar, StartklarSchritt, StartklarKey, StartklarRohdaten } from './schritte';

/** Rohdaten für die Startklar-Checkliste einer Agentur (Service-Client – Aufrufer prüft den Zugriff) */
export async function ladeStartklarRohdaten(svc: SupabaseClient, agencyId: string): Promise<StartklarRohdaten> {
  const { data: kundenNutzer } = await svc.from('users').select('id').eq('agency_id', agencyId).in('role', [...KUNDEN_ROLLEN]);
  const nutzerIds = ((kundenNutzer ?? []) as Array<{ id: string }>).map((u) => u.id);
  const [agency, nutzer, einladungen, wa, lektion, anrufe, push] = await Promise.all([
    svc.from('agencies').select('onboarding_completed, outbound_phone').eq('id', agencyId).maybeSingle(),
    svc.from('users').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId).in('role', [...KUNDEN_ROLLEN]),
    svc.from('invite_tokens').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId).in('role', ['agency_member', 'agency_viewer']),
    svc.from('whatsapp_accounts').select('id').eq('agency_id', agencyId).eq('status', 'connected').limit(1),
    svc.from('agency_lesson_progress').select('id').eq('agency_id', agencyId).eq('watched', true).limit(1),
    svc.from('call_logs').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId),
    nutzerIds.length
      ? svc.from('push_subscriptions').select('id', { count: 'exact', head: true }).in('user_id', nutzerIds)
      : Promise.resolve({ count: 0 }),
  ]);
  const a = agency.data as { onboarding_completed: boolean | null; outbound_phone: string | null } | null;
  return {
    onboardingAbgeschlossen: a?.onboarding_completed === true,
    nutzer: nutzer.count ?? 0,
    teamEinladungen: einladungen.count ?? 0,
    whatsappVerbunden: (wa.data?.length ?? 0) > 0,
    outboundPhone: a?.outbound_phone ?? null,
    masterclassGestartet: (lektion.data?.length ?? 0) > 0,
    anrufe: anrufe.count ?? 0,
    pushGeraete: push.count ?? 0,
  };
}

/** Startklar-Stand einer Agentur – auch für Übersichten (z. B. Kontrollzentrum) wiederverwendbar */
export async function ladeStartklar(svc: SupabaseClient, agencyId: string): Promise<Startklar> {
  return werteStartklarAus(await ladeStartklarRohdaten(svc, agencyId));
}
