import type { SupabaseClient } from '@supabase/supabase-js';
import { getStagesForAgency } from '@/lib/pipeline/get-stages';
import { findDuplicateCandidate } from '@/lib/candidates/find-duplicate';
import { checkBlacklist } from '@/lib/candidates/blacklist-check';
import { logActivity } from '@/lib/activity/log';
import { fireEvent } from '@/lib/automations/fire';
import { autoStelle, istKampagnenId, ladeZuordnung, merkeAutoZuordnung, type Utm } from '@/lib/kosten/kampagnen';

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
  /** Antworten aus dem Funnel („Frage → Antwort“) → vorquali_json */
  angaben?: Record<string, string> | null;
  /** UTM aus dem Funnel (utm_campaign = Meta-Kampagnen-ID, utm_term = Anzeigengruppe) */
  utm?: Utm | null;
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
    if (lead.angaben && Object.keys(lead.angaben).length) await svc.from('candidates').update({ vorquali_json: lead.angaben }).eq('id', duplicate.id).is('vorquali_json', null);
    if (lead.utm?.campaign) await svc.from('candidates').update({ meta_campaign: lead.utm.campaign, meta_adset: lead.utm.adset }).eq('id', duplicate.id).is('meta_campaign', null);
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
      ...(lead.utm ? { meta_campaign: lead.utm.campaign, meta_adset: lead.utm.adset } : {}),
      ...(lead.angaben && Object.keys(lead.angaben).length ? { vorquali_json: lead.angaben } : {}),
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

  // Auch als Bewerbung anlegen – sonst fehlt der Lead in Kennzahlen, Phasen-Logik und Warnungen.
  // Stelle: aus der Kampagnen-Zuordnung, sonst die Standard-Stelle
  const kampagne = istKampagnenId(lead.utm?.campaign) ? lead.utm!.campaign! : null;
  const zuordnung = kampagne ? await ladeZuordnung(svc, kampagne) : null;
  const { data: aktive } = await svc
    .from('jobs')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('status', 'active')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  const aktiveIds = ((aktive ?? []) as Array<{ id: string }>).map((j) => j.id);
  const zugeordnet = zuordnung?.agency_id === agencyId && aktiveIds.includes(zuordnung.job_id) ? zuordnung.job_id : null;
  const stelle = zugeordnet ? { id: zugeordnet } : aktiveIds[0] ? { id: aktiveIds[0] } : null;
  const einzigeStelle = autoStelle(aktiveIds);
  if (kampagne && !zuordnung && einzigeStelle) {
    const r = await merkeAutoZuordnung(svc, { campaign_id: kampagne, agency_id: agencyId, job_id: einzigeStelle });
    if (r === 'fehler') console.error('[perspective] Kampagnen-Zuordnung nicht gespeichert');
  }
  const ref = lead.externeId ? `perspective:${lead.externeId}` : null;
  const { count: schonDa } = ref ? await svc.from('applications').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId).eq('source_ref', ref) : { count: 0 };
  if (stelle && !schonDa) {
    const { error: appErr } = await svc.from('applications').insert({
      agency_id: agencyId,
      candidate_id: c.id,
      job_id: (stelle as { id: string }).id,
      stage_id: firstStage.id,
      source: 'meta',
      source_ref: lead.externeId ? `perspective:${lead.externeId}` : null,
      campaign: lead.funnelName || lead.utm ? { ...(lead.funnelName ? { funnel: lead.funnelName } : {}), ...(lead.utm ? { utm: lead.utm } : {}) } : null,
      ...(lead.eingegangenAm ? { applied_at: lead.eingegangenAm } : {}),
    });
    if (appErr) console.error('[perspective] Bewerbung nicht angelegt:', appErr.message);
  }

  // Bild-/Datei-Uploads aus dem Funnel übernehmen (Job, damit der Webhook schnell bleibt)
  const { planeFunnelDateien } = await import('./dateien');
  await planeFunnelDateien(svc, agencyId, c.id, lead.angaben).catch((err) => console.error('[perspective] Datei-Übernahme nicht geplant:', err));

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
