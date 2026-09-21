/**
 * Einziger Ausgangsweg für alle WhatsApp-Nachrichten.
 * Führt Preflight-Checks durch und schreibt die Message-Row.
 *
 * Vertrag (C1): Bei jedem Fehler wird ein Error geworfen (deutscher Text).
 * Downstream (Tasks 6/9) fängt via try/catch.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { checkPreflight } from './window';
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

export async function sendWhatsAppMessage(
  svc: SupabaseClient,
  opts: SendOpts
): Promise<{ messageId: string; messageRowId: string }> {
  // 1. WhatsApp-Account laden (I1: agency_id-Scoping, da Service-Role RLS umgeht)
  const { data: waAccount } = await svc
    .from('whatsapp_accounts')
    .select('id, phone_number_id, access_token_enc, status')
    .eq('id', opts.waAccountId)
    .eq('agency_id', opts.agencyId)
    .single();

  if (!waAccount) {
    throw new Error('WhatsApp-Konto nicht gefunden');
  }

  // 2. Conversation + Candidate laden für Preflight (I1: agency_id-Scoping)
  const { data: conv } = await svc
    .from('conversations')
    .select('window_expires_at, candidate_id')
    .eq('id', opts.conversationId)
    .eq('agency_id', opts.agencyId)
    .single();

  if (!conv) {
    throw new Error('Konversation nicht gefunden');
  }

  const { data: candidate } = await svc
    .from('candidates')
    .select('whatsapp_opt_in')
    .eq('id', conv.candidate_id)
    .eq('agency_id', opts.agencyId)
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
  const preflight = checkPreflight({
    consentWhatsapp: candidate?.whatsapp_opt_in ?? false,
    windowExpiresAt: conv.window_expires_at,
    isTemplate,
    isHumanUiSend: opts.isHumanUiSend ?? false,
    timezone,
    accountConnected: waAccount.status === 'connected',
  });

  if (!preflight.ok) {
    // C1: Preflight-Ablehnung als Error werfen mit dem reason als Nachricht
    throw new Error(preflight.reason ?? 'Preflight fehlgeschlagen');
  }

  // C2: Token entschlüsseln VOR dem Anlegen der Message-Row.
  // Crypto-Fehler dürfen nie in error_code landen — kein catch bis zur Row-Anlage.
  const token = decryptSecret(waAccount.access_token_enc);

  // 5. bodyText ableiten (M2: audio + interactive ergänzt)
  const bodyText =
    opts.payload.text?.body
    || opts.payload.template?.name
    || (opts.payload.type === 'image' ? '[Bild]'
      : opts.payload.type === 'document' ? '[Dokument]'
      : opts.payload.type === 'audio' ? '[Audio]'
      : opts.payload.type === 'interactive' ? '[Interaktiv]'
      : '[Nachricht]');

  // 6. Message-Row anlegen (status queued)
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
    throw new Error('Nachricht konnte nicht gespeichert werden');
  }

  // 7. An Provider senden — nur noch Provider-Fehler können hier landen (Crypto ist oben bereits erledigt)
  try {
    const provider = getProvider();
    const result = await provider.sendMessage(waAccount.phone_number_id, token, opts.payload);

    // 8. Message-Row aktualisieren
    await svc
      .from('messages')
      .update({ wa_message_id: result.messageId, status: 'sent' })
      .eq('id', msgRow.id);

    // 9. Conversation aktualisieren
    await svc
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', opts.conversationId);

    return { messageId: result.messageId, messageRowId: msgRow.id };
  } catch (err) {
    // C2: Provider-Fehler in error_code speichern (max 200 Zeichen), dann re-throw
    const rawMsg = err instanceof Error ? err.message : 'Unbekannter Provider-Fehler';
    const sanitized = rawMsg.slice(0, 200);
    await svc
      .from('messages')
      .update({ status: 'failed', error_code: sanitized })
      .eq('id', msgRow.id);

    // C1: Re-throw damit Downstream try/catch greifen kann
    throw err instanceof Error ? err : new Error(rawMsg);
  }
}
