/**
 * Worker: Bot-Timeout (Phase 3, Task 6).
 * Setzt die Conversation auf 'waiting' wenn der Kandidat nach 48h nicht geantwortet hat.
 * Keine Nachricht an den Bewerber — nur state-Update und Activity-Log.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/activity/log';

export async function processBotTimeout(
  svc: SupabaseClient,
  agencyId: string,
  payload: { conversation_id: string; bot_step: number }
): Promise<void> {
  const { conversation_id: conversationId, bot_step: payloadBotStep } = payload;

  // --- 1. Conversation laden ---
  const { data: conv } = await svc
    .from('conversations')
    .select('id, state, bot_step, candidate_id, application_id')
    .eq('id', conversationId)
    .eq('agency_id', agencyId)
    .maybeSingle();

  // No-op wenn nicht mehr bot_active oder bot_step hat sich geändert (Antwort kam)
  if (!conv || conv.state !== 'bot_active' || conv.bot_step !== payloadBotStep) return;

  // --- 2. state auf 'waiting' setzen (P3-R1) ---
  await svc
    .from('conversations')
    .update({ state: 'waiting', updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('agency_id', agencyId);

  // --- 3. Activity loggen ---
  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: conv.candidate_id ?? null,
    action: 'Bot-Timeout: Kandidat hat nicht innerhalb von 48h geantwortet',
    action_type: 'bot_timeout',
    metadata: {
      conversation_id: conversationId,
      bot_step: payloadBotStep,
      application_id: conv.application_id ?? null,
    },
  });
}
