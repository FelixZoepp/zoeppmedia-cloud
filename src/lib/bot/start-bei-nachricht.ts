/**
 * Bewerber schreibt zuerst (z. B. über „Weiter per WhatsApp“ oder nach einer Anzeige):
 * Gibt es eine offene Bewerbung mit aktivem KI-Agenten, die noch nicht qualifiziert ist, und hat kein Mensch
 * das Gespräch übernommen, startet der Agent direkt – im offenen 24-h-Fenster ohne Vorlage.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function starteAgentBeiNachricht(
  svc: SupabaseClient,
  p: { agencyId: string; conversationId: string; candidateId: string; applicationId: string | undefined; zugewiesen: string | null; state: string },
): Promise<boolean> {
  if (!p.applicationId || p.zugewiesen || p.state !== 'waiting') return false;
  const { data: app } = await svc.from('applications').select('id, job_id, score_label').eq('id', p.applicationId).eq('agency_id', p.agencyId).maybeSingle();
  const a = app as { id: string; job_id: string; score_label: string | null } | null;
  if (!a || a.score_label) return false; // schon qualifiziert
  const { data: job } = await svc.from('jobs').select('bot_config_id').eq('id', a.job_id).maybeSingle();
  const cfgId = (job as { bot_config_id: string | null } | null)?.bot_config_id;
  if (!cfgId) return false;
  const { data: cfg } = await svc.from('bot_configs').select('active').eq('id', cfgId).maybeSingle();
  if (!(cfg as { active: boolean } | null)?.active) return false;

  // Wer selbst schreibt, möchte eine Antwort – Einwilligung mit Quelle vermerken
  await svc.from('candidates').update({ whatsapp_opt_in: true, consent_source: 'bewerber_schrieb_zuerst' }).eq('id', p.candidateId).eq('agency_id', p.agencyId).eq('whatsapp_opt_in', false);
  const { data: geaendert } = await svc
    .from('conversations')
    .update({ application_id: a.id, state: 'bot_active', bot_step: 0, bot_meta: {}, updated_at: new Date().toISOString() })
    .eq('id', p.conversationId)
    .eq('agency_id', p.agencyId)
    .eq('state', 'waiting')
    .is('assigned_to', null)
    .select('id');
  return !!geaendert?.length;
}
