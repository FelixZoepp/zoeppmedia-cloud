import type { SupabaseClient } from '@supabase/supabase-js';
import { istFreigegeben } from '@/lib/freigaben';
import { createNotificationForAgency } from './create';

/** Glocke + Push ans Kunden-Team für einen frisch eingegangenen Bewerber (Funnel/Indeed) – nur mit Freigabe bewerber_push */
export async function meldeNeuenBewerber(
  svc: SupabaseClient,
  agencyId: string,
  b: { candidateId: string; name: string | null; phone: string | null; quelle: string },
): Promise<void> {
  if (!(await istFreigegeben(svc, 'bewerber_push'))) return;
  await sendeBewerberMeldung(svc, agencyId, b);
}

/** Dieselbe Meldung ohne Freigabe-Prüfung – nur für den von Felix angestoßenen Testlauf (Job admin.test_bewerber_push) */
export async function sendeBewerberMeldung(
  svc: SupabaseClient,
  agencyId: string,
  b: { candidateId: string; name: string | null; phone: string | null; quelle: string },
): Promise<void> {
  await createNotificationForAgency(svc, agencyId, {
    title: `Neuer Bewerber (${b.quelle}): ${b.name || 'Unbekannt'}`,
    body: b.phone ? `Jetzt anrufen: ${b.phone}` : 'Jetzt kontaktieren',
    type: 'new_candidate',
    entity_type: 'candidate',
    entity_id: b.candidateId,
    push_url: `/candidates/${b.candidateId}`,
  });
}
