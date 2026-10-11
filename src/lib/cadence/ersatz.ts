/**
 * Ersatzweg, wenn der KI-Agent einen Bewerber nicht anschreiben kann (keine Einwilligung, keine Nummer verbunden,
 * kein aktiver Agent, Vorlage nicht freigegeben): Bewerber erscheint nach 15 Min. beim Innendienst unter
 * „Anrufe fällig“ (Nicht-erreicht-Kadenz). Kein Bewerber bleibt liegen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { startCadence } from './engine';
import { logActivity } from '@/lib/activity/log';

export async function starteAnrufErsatz(svc: SupabaseClient, agencyId: string, candidateId: string, grund: string): Promise<boolean> {
  const { data } = await svc.from('candidates').select('phone_e164, cadence_active, first_contact_at').eq('id', candidateId).eq('agency_id', agencyId).maybeSingle();
  const c = data as { phone_e164: string | null; cadence_active: boolean | null; first_contact_at: string | null } | null;
  if (!c?.phone_e164 || c.cadence_active || c.first_contact_at) return false;
  await startCadence(svc, candidateId, agencyId);
  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: candidateId,
    action: `Anruf durch Innendienst eingeplant (KI-Agent nicht möglich: ${grund})`,
    action_type: 'other',
    metadata: { kind: 'anruf_ersatz', grund },
  }).catch(() => {});
  return true;
}
