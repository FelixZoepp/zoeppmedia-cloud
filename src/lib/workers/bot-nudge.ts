/**
 * Worker: Bot-Nachfassen (Phase 3, Task 6).
 * Sendet qualification_nudge (Step 0) oder qualification_resume (Step > 0)
 * wenn der Kandidat noch nicht geantwortet hat.
 * Fehler beim Senden werden gefangen — kein Dead-Letter-Risiko.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';

export async function processBotNudge(
  svc: SupabaseClient,
  agencyId: string,
  payload: { conversation_id: string; bot_step: number }
): Promise<void> {
  const { conversation_id: conversationId, bot_step: payloadBotStep } = payload;

  // --- 1. Conversation laden ---
  const { data: conv } = await svc
    .from('conversations')
    .select('id, state, bot_step, candidate_id, wa_account_id, application_id')
    .eq('id', conversationId)
    .eq('agency_id', agencyId)
    .maybeSingle();

  // No-op wenn Conversation nicht mehr bot_active oder bot_step hat sich geändert
  if (!conv || conv.state !== 'bot_active' || conv.bot_step !== payloadBotStep) return;

  // --- 2. Kandidat laden (für vorname) ---
  const { data: candidate } = await svc
    .from('candidates')
    .select('id, name, phone_e164')
    .eq('id', conv.candidate_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!candidate?.phone_e164) return;

  // --- 3. Job laden (für Jobtitel) ---
  let jobTitle = '';
  if (conv.application_id) {
    const { data: application } = await svc
      .from('applications')
      .select('job_id')
      .eq('id', conv.application_id)
      .eq('agency_id', agencyId)
      .maybeSingle();

    if (application?.job_id) {
      const { data: job } = await svc
        .from('jobs')
        .select('title')
        .eq('id', application.job_id)
        .eq('agency_id', agencyId)
        .maybeSingle();
      jobTitle = job?.title ?? '';
    }
  }

  // --- 4. WhatsApp-Account laden ---
  const { data: waAccount } = await svc
    .from('whatsapp_accounts')
    .select('id, status')
    .eq('id', conv.wa_account_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!waAccount) return;

  // --- 5. Template laden (Preset je nach bot_step) ---
  const presetKey = payloadBotStep === 0 ? 'qualification_nudge' : 'qualification_resume';

  const { data: template } = await svc
    .from('whatsapp_templates')
    .select('id, name, language')
    .eq('agency_id', agencyId)
    .eq('wa_account_id', waAccount.id)
    .eq('preset_key', presetKey)
    .eq('status', 'approved')
    .maybeSingle();

  if (!template) return;

  const vorname = candidate.name.split(' ')[0];

  // --- 6. Template-Payload bauen ---
  const parameters =
    payloadBotStep === 0
      ? [
          { type: 'text', text: vorname },
          { type: 'text', text: jobTitle },
        ]
      : [{ type: 'text', text: vorname }];

  const templatePayload = {
    to: candidate.phone_e164,
    type: 'template' as const,
    template: {
      name: template.name as string,
      language: { code: template.language as string },
      components: [
        {
          type: 'body',
          parameters,
        },
      ],
    },
  };

  // --- 7. Senden — Fehler NICHT propagieren (kein Dead-Letter) ---
  await sendWhatsAppMessage(svc, {
    agencyId,
    conversationId,
    candidatePhone: candidate.phone_e164,
    waAccountId: waAccount.id,
    payload: templatePayload,
    senderType: 'bot',
    templateId: template.id as string,
  }).catch(() => {});
}
