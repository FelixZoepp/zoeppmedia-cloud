/**
 * Worker: WhatsApp-Zustellstatus aktualisieren.
 */

import { SupabaseClient } from '@supabase/supabase-js';

interface StatusPayload {
  type: 'whatsapp.status';
  phone_number_id: string;
  status: {
    id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    errors?: Array<{ code: number; title: string }>;
    recipient_id: string;
  };
}

export async function processStatus(svc: SupabaseClient, payload: StatusPayload) {
  const s = payload.status;
  const waMessageId = s.id;

  const updates: Record<string, unknown> = {
    status: s.status,
  };

  if (s.status === 'failed' && s.errors?.length) {
    updates.error_code = `${s.errors[0].code}: ${s.errors[0].title}`;
  }

  await svc.from('messages')
    .update(updates)
    .eq('wa_message_id', waMessageId);
}
