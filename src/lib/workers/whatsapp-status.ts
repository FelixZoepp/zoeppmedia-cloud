/**
 * Worker: WhatsApp-Zustellstatus aktualisieren.
 * C2: Status-Downgrade-Guard — out-of-order Webhooks können einen höheren Status
 * nicht zurücksetzen (queued < sent < delivered < read; failed nur wenn nicht read).
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

  // C2: Downgrade-Guard via filtered UPDATE.
  // Für jeden eingehenden Status wird nur dann aktualisiert, wenn der aktuelle DB-Status
  // kleiner/gleich dem eingehenden ist (Rang: queued < sent < delivered < read).
  // 'failed' greift nur, wenn der aktuelle Status noch nicht 'read' ist.
  let query = svc.from('messages').update(updates).eq('wa_message_id', waMessageId);

  switch (s.status) {
    case 'sent':
      // nur upgraden wenn noch auf 'queued'
      query = query.eq('status', 'queued');
      break;
    case 'delivered':
      // nur upgraden wenn noch auf 'queued' oder 'sent'
      query = query.in('status', ['queued', 'sent']);
      break;
    case 'read':
      // nur upgraden wenn noch nicht 'read'
      query = query.in('status', ['queued', 'sent', 'delivered']);
      break;
    case 'failed':
      // 'failed' nicht setzen wenn bereits 'read'
      query = query.neq('status', 'read');
      break;
  }

  await query;
}
