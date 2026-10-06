import type { SupabaseClient } from '@supabase/supabase-js';
import { getStagesForAgency } from '@/lib/pipeline/get-stages';
import { findDuplicateCandidate } from '@/lib/candidates/find-duplicate';
import { checkBlacklist } from '@/lib/candidates/blacklist-check';
import { logActivity } from '@/lib/activity/log';
import { fireEvent } from '@/lib/automations/fire';

export interface FunnelLead {
  name: string | null;
  email: string | null;
  phone: string | null;
  funnelName: string | null;
  /** Perspective-Kontakt-ID – verhindert doppelte Anlage beim Abgleich */
  externeId?: string | null;
  /** Zeitpunkt der Conversion im Funnel (für nachgeholte Leads) */
  eingegangenAm?: string | null;
  /**
   * Automationen (Begrüßung per WhatsApp, Kadenz …) nur für frische Leads auslösen –
   * nachgeholte ältere Leads sollen keine Nachrichten verschicken.
   */
  automationen: boolean;
}

export type LeadErgebnis =
  | { status: 'angelegt'; candidateId: string }
  | { status: 'doppelt'; candidateId: string }
  | { status: 'fehler'; fehler: string };

/** Funnel-Lead (Perspective, kommt über Meta-Anzeigen) als Bewerber in der Kunden-Cloud anlegen. */
export async function legeFunnelLeadAn(svc: SupabaseClient, agencyId: string, lead: FunnelLead): Promise<LeadErgebnis> {
  if (!lead.name && !lead.email && !lead.phone) return { status: 'fehler', fehler: 'Keine Kontaktdaten' };

  if (lead.externeId) {
    const { data: schon } = await svc.from('candidates').select('id').eq('agency_id', agencyId).eq('externe_id', lead.externeId).maybeSingle();
    if (schon) return { status: 'doppelt', candidateId: (schon as { id: string }).id };
  }

  const duplicate = await findDuplicateCandidate(svc, agencyId, lead.email, lead.phone);
  if (duplicate) {
    // Kennung nachtragen, damit der Abgleich den Lead künftig direkt erkennt
    if (lead.externeId) await svc.from('candidates').update({ externe_id: lead.externeId }).eq('id', duplicate.id).is('externe_id', null);
    return { status: 'doppelt', candidateId: duplicate.id };
  }

  const stages = await getStagesForAgency(svc, agencyId);
  const firstStage = stages[0];
  if (!firstStage) return { status: 'fehler', fehler: 'Keine Pipeline-Stufen konfiguriert' };

  const { data: candidate, error } = await svc
    .from('candidates')
    .insert({
      agency_id: agencyId,
      name: lead.name || 'Unbekannt',
      email: lead.email,
      phone: lead.phone,
      source: 'meta', // Perspective-Leads kommen über Meta-Anzeigen-Funnels
      meta_form: lead.funnelName,
      current_stage_id: firstStage.id,
      externe_id: lead.externeId ?? null,
      ...(lead.eingegangenAm ? { created_at: lead.eingegangenAm } : {}),
    })
    .select('id, name')
    .single();
  if (error || !candidate) {
    // Gleichzeitig vom Webhook angelegt → als doppelt werten
    if (error?.code === '23505' && lead.externeId) {
      const { data: schon } = await svc.from('candidates').select('id').eq('agency_id', agencyId).eq('externe_id', lead.externeId).maybeSingle();
      if (schon) return { status: 'doppelt', candidateId: (schon as { id: string }).id };
    }
    return { status: 'fehler', fehler: error?.message ?? 'Bewerber konnte nicht erstellt werden' };
  }
  const c = candidate as { id: string; name: string };

  await svc.from('candidate_stages').insert({ candidate_id: c.id, stage_id: firstStage.id, changed_by: null });

  if (lead.automationen) fireEvent('candidate_created', agencyId, { candidate_id: c.id }).catch(() => {});

  const blacklist = await checkBlacklist(svc, agencyId, lead.email, lead.phone);
  if (blacklist.is_blacklisted) {
    await logActivity(svc, {
      agency_id: agencyId,
      candidate_id: c.id,
      action: `Blacklist-Warnung (Funnel): Bewerber ${c.name} stimmt mit gesperrtem Bewerber ${blacklist.matching_candidate?.name} überein`,
      action_type: 'other',
      metadata: { source: 'perspective', blacklist_match: blacklist.matching_candidate },
    });
  }
  return { status: 'angelegt', candidateId: c.id };
}
