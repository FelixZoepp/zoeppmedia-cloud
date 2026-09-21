/**
 * Worker: Bot-Abschluss (+48h, Phase 4 Task 10).
 * Setzt Conversation auf 'closed' und Application auf 'nicht_erreicht'
 * wenn Kandidat nach 48h nicht geantwortet hat. Sendet Admin-Notification.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotificationForAgency } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';

export async function processBotClose(
  svc: SupabaseClient,
  agencyId: string,
  payload: { conversation_id: string; bot_step: number },
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

  // --- 2. Conversation state auf 'closed' setzen (P4-R11: 48h ohne Antwort = geschlossen) ---
  await svc
    .from('conversations')
    .update({ state: 'closed', updated_at: new Date().toISOString() })
    .eq('id', conv.id)
    .eq('agency_id', agencyId);

  // --- 3. Application-Status auf 'nicht_erreicht' setzen ---
  if (conv.application_id) {
    await svc
      .from('applications')
      .update({ status: 'nicht_erreicht', updated_at: new Date().toISOString() })
      .eq('id', conv.application_id)
      .eq('agency_id', agencyId);
  }

  // --- 4. Kandidaten-Name für Notification laden ---
  const { data: candidate } = await svc
    .from('candidates')
    .select('name')
    .eq('id', conv.candidate_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  // --- 5. Admin-Notification senden ---
  await createNotificationForAgency(svc, agencyId, {
    title: `Bewerber nicht erreicht: ${candidate?.name ?? 'Unbekannt'}`,
    body: 'Keine Antwort nach 48 Stunden. Gespräch geschlossen.',
    type: 'system',
    push_url: `/inbox?conversation=${conv.id}`,
  }).catch(() => {});

  // --- 6. Activity loggen ---
  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: conv.candidate_id ?? null,
    action: 'Bot-Gespräch geschlossen: keine Antwort nach 48h',
    action_type: 'bot_closed',
    metadata: {
      conversation_id: conversationId,
      bot_step: payloadBotStep,
      application_id: conv.application_id ?? null,
    },
  });
}
