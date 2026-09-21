/**
 * Einziger Ausgangsweg fuer alle WhatsApp-Nachrichten.
 * Fuehrt Preflight-Checks durch und schreibt die Message-Row.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { checkPreflight, type PreflightResult } from './window';
import { getProvider, type SendMessagePayload } from './provider';
import { decryptSecret } from '@/lib/crypto';

export interface SendOpts {
  agencyId: string;
  conversationId: string;
  candidatePhone: string;
  waAccountId: string;
  payload: SendMessagePayload;
  senderType: 'bot' | 'user' | 'system';
  userId?: string | null;
  templateId?: string | null;
  /** true wenn ein Recruiter die Nachricht manuell im UI sendet */
  isHumanUiSend?: boolean;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  messageRowId?: string;
  error?: string;
}

export async function sendWhatsAppMessage(
  svc: SupabaseClient,
  opts: SendOpts
): Promise<SendResult> {
  // 1. WhatsApp-Account laden
  const { data: waAccount } = await svc
    .from('whatsapp_accounts')
    .select('id, phone_number_id, access_token_enc, status')
    .eq('id', opts.waAccountId)
    .single();

  if (!waAccount) {
    return { ok: false, error: 'WhatsApp-Konto nicht gefunden' };
  }

  // 2. Conversation + Candidate laden fuer Preflight
  const { data: conv } = await svc
    .from('conversations')
    .select('window_expires_at, candidate_id')
    .eq('id', opts.conversationId)
    .single();

  if (!conv) {
    return { ok: false, error: 'Konversation nicht gefunden' };
  }

  const { data: candidate } = await svc
    .from('candidates')
    .select('whatsapp_opt_in')
    .eq('id', conv.candidate_id)
    .single();

  // 3. Agency-Timezone laden
  const { data: agency } = await svc
    .from('agencies')
    .select('timezone')
    .eq('id', opts.agencyId)
    .single();

  const timezone = agency?.timezone || 'Europe/Berlin';

  // 4. Preflight
  const isTemplate = opts.payload.type === 'template';
  const preflight: PreflightResult = checkPreflight({
    consentWhatsapp: candidate?.whatsapp_opt_in ?? false,
    windowExpiresAt: conv.window_expires_at,
    isTemplate,
    isHumanUiSend: opts.isHumanUiSend ?? false,
    timezone,
    accountConnected: waAccount.status === 'connected',
  });

  if (!preflight.ok) {
    return { ok: false, error: preflight.reason };
  }

  // 5. Message-Row anlegen (status queued)
  const bodyText = opts.payload.text?.body
    || opts.payload.template?.name
    || (opts.payload.type === 'image' ? '[Bild]' : opts.payload.type === 'document' ? '[Dokument]' : '[Nachricht]');

  const { data: msgRow, error: insertErr } = await svc
    .from('messages')
    .insert({
      agency_id: opts.agencyId,
      conversation_id: opts.conversationId,
      direction: 'out',
      sender_type: opts.senderType,
      user_id: opts.userId || null,
      type: opts.payload.type,
      body: bodyText,
      status: 'queued',
      template_id: opts.templateId || null,
      cost_category: isTemplate ? 'utility' : 'service',
    })
    .select('id')
    .single();

  if (insertErr || !msgRow) {
    return { ok: false, error: 'Nachricht konnte nicht gespeichert werden' };
  }

  // 6. An Provider senden
  try {
    const token = decryptSecret(waAccount.access_token_enc);
    const provider = getProvider();
    const result = await provider.sendMessage(waAccount.phone_number_id, token, opts.payload);

    // 7. Message-Row aktualisieren
    await svc.from('messages')
      .update({ wa_message_id: result.messageId, status: 'sent' })
      .eq('id', msgRow.id);

    // 8. Conversation aktualisieren
    await svc.from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', opts.conversationId);

    return { ok: true, messageId: result.messageId, messageRowId: msgRow.id };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    await svc.from('messages')
      .update({ status: 'failed', error_code: errorMsg })
      .eq('id', msgRow.id);

    return { ok: false, messageRowId: msgRow.id, error: errorMsg };
  }
}
