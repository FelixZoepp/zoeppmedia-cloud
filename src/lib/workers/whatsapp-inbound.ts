/**
 * Worker: eingehende WhatsApp-Nachricht verarbeiten.
 * Speichert Message, upserted Conversation, setzt window_expires_at,
 * erkennt STOP, aktualisiert unread_count, erstellt Benachrichtigung.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { isStopMessage } from '@/lib/whatsapp/window';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { createNotification, createNotificationForAgency } from '@/lib/notifications/create';

interface InboundPayload {
  type: 'whatsapp.inbound';
  phone_number_id: string;
  message: {
    id: string;
    from: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    image?: { id: string; mime_type: string; caption?: string };
    document?: { id: string; mime_type: string; filename: string; caption?: string };
    audio?: { id: string; mime_type: string };
  };
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
}

export async function processInbound(svc: SupabaseClient, agencyId: string, payload: InboundPayload) {
  const msg = payload.message;
  const senderPhone = msg.from.startsWith('+') ? msg.from : `+${msg.from}`;

  // 1. WhatsApp-Account auflösen
  const { data: waAccount } = await svc
    .from('whatsapp_accounts')
    .select('id, agency_id')
    .eq('phone_number_id', payload.phone_number_id)
    .single();

  if (!waAccount) {
    throw new Error(`Kein WhatsApp-Account für phone_number_id ${payload.phone_number_id}`);
  }

  const effectiveAgencyId = agencyId || waAccount.agency_id;

  // 2. Candidate finden (phone_e164 im Mandanten)
  const { data: candidate } = await svc
    .from('candidates')
    .select('id, name, whatsapp_opt_in')
    .eq('agency_id', effectiveAgencyId)
    .eq('phone_e164', senderPhone)
    .is('deleted_at', null)
    .maybeSingle();

  if (!candidate) {
    // Unbekannte Nummer — kein Kandidat im System. Event als done markieren.
    return;
  }

  // 3. Conversation upsert
  const windowExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: existingConv } = await svc
    .from('conversations')
    .select('id, state, assigned_to, unread_count')
    .eq('wa_account_id', waAccount.id)
    .eq('candidate_id', candidate.id)
    .maybeSingle();

  let conversationId: string;
  let assignedTo: string | null = null;

  if (existingConv) {
    conversationId = existingConv.id;
    assignedTo = existingConv.assigned_to;
    await svc.from('conversations').update({
      window_expires_at: windowExpires,
      unread_count: (existingConv.unread_count || 0) + 1,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId);
  } else {
    const { data: newConv, error: convErr } = await svc
      .from('conversations')
      .insert({
        agency_id: effectiveAgencyId,
        candidate_id: candidate.id,
        wa_account_id: waAccount.id,
        state: 'waiting',
        window_expires_at: windowExpires,
        unread_count: 1,
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (convErr || !newConv) throw new Error('Konversation konnte nicht erstellt werden');
    conversationId = newConv.id;
  }

  // 4. Message speichern
  const bodyText = msg.text?.body
    || msg.image?.caption || (msg.type === 'image' ? '[Bild]' : '')
    || msg.document?.caption || (msg.type === 'document' ? '[Dokument]' : '')
    || (msg.type === 'audio' ? '[Sprachnachricht]' : '')
    || '';

  const messageType = (['text', 'image', 'document', 'audio'].includes(msg.type) ? msg.type : 'text') as 'text' | 'image' | 'document' | 'audio';

  await svc.from('messages').insert({
    agency_id: effectiveAgencyId,
    conversation_id: conversationId,
    direction: 'in',
    sender_type: 'candidate',
    type: messageType,
    body: bodyText,
    wa_message_id: msg.id,
    status: 'delivered',
  });

  // 5. STOP-Erkennung
  if (isStopMessage(msg.text?.body)) {
    await svc.from('candidates')
      .update({ whatsapp_opt_in: false })
      .eq('id', candidate.id);

    await svc.from('conversations')
      .update({ state: 'closed', updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Einmalige Abmeldebestätigung
    await sendWhatsAppMessage(svc, {
      agencyId: effectiveAgencyId,
      conversationId,
      candidatePhone: senderPhone,
      waAccountId: waAccount.id,
      payload: {
        to: senderPhone,
        type: 'text',
        text: { body: 'Du erhältst keine weiteren Nachrichten von uns. Falls du es dir anders überlegst, melde dich jederzeit.' },
      },
      senderType: 'system',
      isHumanUiSend: true, // Ausnahme von Ruhezeiten — Pflichtbestätigung
    }).catch(() => {}); // Best effort

    return;
  }

  // 6. Media-Download als scheduled_job planen
  const mediaId = msg.image?.id || msg.document?.id || msg.audio?.id;
  if (mediaId) {
    await svc.from('scheduled_jobs').insert({
      agency_id: effectiveAgencyId,
      run_at: new Date().toISOString(),
      type: 'media.download',
      payload: {
        media_id: mediaId,
        mime_type: msg.image?.mime_type || msg.document?.mime_type || msg.audio?.mime_type,
        message_id: msg.id,
        conversation_id: conversationId,
        wa_account_id: waAccount.id,
      },
      status: 'pending',
    });
  }

  // 7. Benachrichtigungen (R1: Typ 'whatsapp_inbound')
  if (assignedTo) {
    // Benachrichtigung an zugewiesenen Recruiter
    await createNotification(svc, {
      user_id: assignedTo,
      agency_id: effectiveAgencyId,
      title: `Neue Nachricht von ${candidate.name}`,
      body: bodyText.slice(0, 100),
      type: 'whatsapp_inbound',
      entity_type: 'candidate',
      entity_id: candidate.id,
      push_url: `/inbox?conversation=${conversationId}`,
    }).catch(() => {});
  } else if (!existingConv) {
    // Neue unzugewiesene Konversation — an alle im Mandanten
    await createNotificationForAgency(svc, effectiveAgencyId, {
      title: `Neue WhatsApp-Nachricht von ${candidate.name}`,
      body: bodyText.slice(0, 100),
      type: 'whatsapp_inbound',
      entity_type: 'candidate',
      entity_id: candidate.id,
      push_url: `/inbox?conversation=${conversationId}`,
    }).catch(() => {});
  }
}
