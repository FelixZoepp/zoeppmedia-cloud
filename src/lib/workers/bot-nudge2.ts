/**
 * Worker: Bot-Nachfassen 2. Erinnerung (+24h, Phase 4 Task 10).
 * Sendet qualification_nudge-Template wenn Kandidat nach 24h noch nicht
 * geantwortet hat. Fehler beim Senden werden gefangen — kein Dead-Letter-Risiko.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';

export async function processBotNudge2(
  svc: SupabaseClient,
  agencyId: string,
  payload: { conversation_id: string; bot_step: number },
): Promise<void> {
  const { conversation_id: conversationId, bot_step: payloadBotStep } = payload;

  // --- 1. Conversation laden ---
  const { data: conv } = await svc
    .from('conversations')
    .select('id, state, bot_step, candidate_id, wa_account_id')
    .eq('id', conversationId)
    .eq('agency_id', agencyId)
    .maybeSingle();

  // No-op wenn Conversation nicht mehr bot_active oder bot_step hat sich geändert
  if (!conv || conv.state !== 'bot_active' || conv.bot_step !== payloadBotStep) return;

  // --- 2. Kandidat laden ---
  const { data: candidate } = await svc
    .from('candidates')
    .select('name, phone_e164')
    .eq('id', conv.candidate_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!candidate?.phone_e164) return;

  // --- 3. Template qualification_nudge laden ---
  const { data: tmpl } = await svc
    .from('whatsapp_templates')
    .select('id, name')
    .eq('wa_account_id', conv.wa_account_id)
    .eq('preset_key', 'qualification_nudge')
    .eq('status', 'approved')
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!tmpl) return;

  // --- 4. Jobtitel über application_id aus Conversation holen ---
  let jobTitle = '';
  const { data: convFull } = await svc
    .from('conversations')
    .select('application_id')
    .eq('id', conv.id)
    .single();

  if (convFull?.application_id) {
    const { data: appData } = await svc
      .from('applications')
      .select('job_id')
      .eq('id', convFull.application_id)
      .eq('agency_id', agencyId)
      .single();

    if (appData?.job_id) {
      const { data: jobData } = await svc
        .from('jobs')
        .select('title')
        .eq('id', appData.job_id)
        .eq('agency_id', agencyId)
        .single();
      jobTitle = jobData?.title ?? '';
    }
  }

  const vorname = (candidate.name || '').split(' ')[0];

  // --- 5. Senden — Fehler NICHT propagieren (kein Dead-Letter) ---
  await sendWhatsAppMessage(svc, {
    agencyId,
    conversationId,
    candidatePhone: candidate.phone_e164,
    waAccountId: conv.wa_account_id,
    payload: {
      to: candidate.phone_e164,
      type: 'template',
      template: {
        name: tmpl.name as string,
        language: { code: 'de' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: vorname },
              { type: 'text', text: jobTitle },
            ],
          },
        ],
      },
    },
    senderType: 'bot',
    templateId: tmpl.id as string,
  }).catch(() => {}); // Nudge-Fehler: kein Dead-Letter
}
