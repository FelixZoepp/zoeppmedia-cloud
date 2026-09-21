/**
 * Übergabe-Helfer: setzt Conversation auf human_active, sendet Best-Effort-Nachricht,
 * erstellt Benachrichtigung und loggt Activity.
 * Phase 3 Task 7.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { cancelBotTimers } from '@/lib/bot/timers';
import { createNotification, createNotificationForAgency } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';

export async function handoverToHuman(
  svc: SupabaseClient,
  args: {
    agencyId: string;
    conversationId: string;
    candidateId: string;
    candidateName: string;
    candidatePhone: string;
    waAccountId: string;
    assignedTo: string | null;
    reason: string;
    notifyCandidate?: boolean;
  }
): Promise<void> {
  const {
    agencyId,
    conversationId,
    candidateId,
    candidateName,
    candidatePhone,
    waAccountId,
    assignedTo,
    reason,
    notifyCandidate = true,
  } = args;

  // 1. Conversation auf human_active setzen
  await svc
    .from('conversations')
    .update({ state: 'human_active', updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('agency_id', agencyId);

  // 2. Timer abbrechen
  await cancelBotTimers(svc, { agencyId, conversationId });

  // 3. Best-Effort-Nachricht an Bewerber
  if (notifyCandidate) {
    await sendWhatsAppMessage(svc, {
      agencyId,
      conversationId,
      candidatePhone,
      waAccountId,
      payload: {
        to: candidatePhone,
        type: 'text',
        text: { body: 'Alles klar — ein Kollege meldet sich gleich bei dir.' },
      },
      senderType: 'system',
    }).catch(() => {}); // Best effort
  }

  // 4. Benachrichtigung
  const pushUrl = `/inbox?conversation=${conversationId}`;
  if (assignedTo) {
    await createNotification(svc, {
      user_id: assignedTo,
      agency_id: agencyId,
      title: `Bot-Übergabe: ${candidateName}`,
      body: reason,
      type: 'whatsapp_inbound',
      push_url: pushUrl,
    }).catch(() => {});
  } else {
    await createNotificationForAgency(svc, agencyId, {
      title: `Bot-Übergabe: ${candidateName}`,
      body: reason,
      type: 'whatsapp_inbound',
      push_url: pushUrl,
    }).catch(() => {});
  }

  // 5. Activity loggen
  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: candidateId,
    action: `Bot-Übergabe: ${reason}`,
    action_type: 'bot_handover',
    metadata: { reason },
  });
}
