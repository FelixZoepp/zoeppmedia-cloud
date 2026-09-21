/**
 * Worker: ausgehende Nachricht senden (aus scheduled_jobs).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import type { SendMessagePayload } from '@/lib/whatsapp/provider';

interface SendJobPayload {
  agency_id: string;
  conversation_id: string;
  candidate_phone: string;
  wa_account_id: string;
  payload: Record<string, unknown>;
  sender_type: 'bot' | 'user' | 'system';
  user_id?: string;
  template_id?: string;
}

export async function processSend(svc: SupabaseClient, jobPayload: SendJobPayload) {
  // R4: sendWhatsAppMessage wirft bei Fehler — kein result.ok-Check nötig
  await sendWhatsAppMessage(svc, {
    agencyId: jobPayload.agency_id,
    conversationId: jobPayload.conversation_id,
    candidatePhone: jobPayload.candidate_phone,
    waAccountId: jobPayload.wa_account_id,
    payload: jobPayload.payload as unknown as SendMessagePayload,
    senderType: jobPayload.sender_type,
    userId: jobPayload.user_id || null,
    templateId: jobPayload.template_id || null,
  });
}
