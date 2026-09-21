/**
 * Worker: Bot-Eröffnung für eine neue Bewerbung (Phase 3, Task 6).
 * Spec §8 Schritt 1 — sendet das application_received-Template und startet Timer.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { armBotTimers } from '@/lib/bot/timers';
import { logActivity } from '@/lib/activity/log';

export async function processBotOpen(
  svc: SupabaseClient,
  agencyId: string,
  payload: { application_id: string }
): Promise<void> {
  const { application_id: applicationId } = payload;

  // --- 1. Bewerbung laden ---
  const { data: application } = await svc
    .from('applications')
    .select('id, candidate_id, job_id, agency_id')
    .eq('id', applicationId)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!application) return;

  // --- 2. Kandidat laden ---
  const { data: candidate } = await svc
    .from('candidates')
    .select('id, name, phone_e164, whatsapp_opt_in')
    .eq('id', application.candidate_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!candidate?.whatsapp_opt_in || !candidate?.phone_e164) return;

  // --- 3. Job laden ---
  const { data: job } = await svc
    .from('jobs')
    .select('id, title, bot_config_id')
    .eq('id', application.job_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!job?.bot_config_id) return;

  // --- 4. BotConfig laden ---
  const { data: botConfig } = await svc
    .from('bot_configs')
    .select('id, active')
    .eq('id', job.bot_config_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!botConfig?.active) return;

  // --- 5. WhatsApp-Account laden (connected) ---
  const { data: waAccount } = await svc
    .from('whatsapp_accounts')
    .select('id, status')
    .eq('agency_id', agencyId)
    .eq('status', 'connected')
    .maybeSingle();

  if (!waAccount) return;

  // --- 6. Template laden (application_received, approved) ---
  const { data: template } = await svc
    .from('whatsapp_templates')
    .select('id, name, language')
    .eq('agency_id', agencyId)
    .eq('wa_account_id', waAccount.id)
    .eq('preset_key', 'application_received')
    .eq('status', 'approved')
    .maybeSingle();

  if (!template) return;

  // --- 7. Agentur-Name laden (für Template-Variable) ---
  const { data: agency } = await svc
    .from('agencies')
    .select('name')
    .eq('id', agencyId)
    .maybeSingle();

  const agencyName = agency?.name ?? agencyId;
  const vorname = candidate.name.split(' ')[0];
  const jobTitle: string = job.title ?? '';

  // --- 8. Conversation anlegen / aktualisieren (Muster aus whatsapp-inbound.ts) ---
  const now = new Date().toISOString();

  // Schritt a: INSERT neue Conversation wenn nicht vorhanden (ignoreDuplicates verhindert Fehler)
  await svc
    .from('conversations')
    .upsert(
      {
        agency_id: agencyId,
        candidate_id: candidate.id,
        wa_account_id: waAccount.id,
        application_id: applicationId,
        state: 'bot_active',
        bot_step: 0,
        bot_meta: {},
        updated_at: now,
      },
      { onConflict: 'wa_account_id,candidate_id', ignoreDuplicates: true }
    );

  // Schritt b: UPDATE bot-spezifischer Felder — anwendbar auf bestehende und neue Row
  const { data: conv } = await svc
    .from('conversations')
    .update({
      application_id: applicationId,
      state: 'bot_active',
      bot_step: 0,
      bot_meta: {},
      updated_at: now,
    })
    .eq('wa_account_id', waAccount.id)
    .eq('candidate_id', candidate.id)
    .eq('agency_id', agencyId)
    .select('id')
    .single();

  if (!conv) {
    throw new Error('Konversation konnte nicht erstellt oder aktualisiert werden');
  }

  const conversationId: string = conv.id;

  // --- 9. Template-Payload bauen (Muster aus /api/whatsapp/send/route.ts) ---
  const templatePayload = {
    to: candidate.phone_e164,
    type: 'template' as const,
    template: {
      name: template.name,
      language: { code: template.language as string },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: vorname },
            { type: 'text', text: jobTitle },
            { type: 'text', text: agencyName },
          ],
        },
      ],
    },
  };

  // --- 10. Nachricht senden — wirft bei Fehler → tick-Retry übernimmt ---
  await sendWhatsAppMessage(svc, {
    agencyId,
    conversationId,
    candidatePhone: candidate.phone_e164,
    waAccountId: waAccount.id,
    payload: templatePayload,
    senderType: 'bot',
    templateId: template.id,
  });

  // --- 11. Timer anlegen ---
  await armBotTimers(svc, { agencyId, conversationId, botStep: 0 });

  // --- 12. Activity loggen ---
  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: candidate.id,
    action: 'Bot-Eröffnung gesendet',
    action_type: 'bot_opened',
    metadata: {
      application_id: applicationId,
      conversation_id: conversationId,
      template: template.name,
    },
  });
}
