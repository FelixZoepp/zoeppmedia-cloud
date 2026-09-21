/**
 * Worker: eingehende WhatsApp-Nachricht verarbeiten.
 * Speichert Message, upserted Conversation, setzt window_expires_at,
 * erkennt STOP, aktualisiert unread_count, erstellt Benachrichtigung.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { isStopMessage } from '@/lib/whatsapp/window';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { createNotification, createNotificationForAgency } from '@/lib/notifications/create';
import { cancelBotTimers } from '@/lib/bot/timers';
import { fireEvent } from '@/lib/automations/fire';

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

  // 3. Conversation anlegen/aktualisieren (C3, atomar in 2 Schritten):
  //    a) INSERT ... ON CONFLICT DO NOTHING (upsert mit ignoreDuplicates: true) —
  //       legt die Row nur an, wenn sie fehlt; state/bot_step bestehender Rows bleiben unberührt,
  //       da Supabase JS kein partielles "DO UPDATE SET <subset>" unterstützt.
  //    b) UPDATE der always-update-Felder (window_expires_at, last_message_at, updated_at)
  //       auf der dann sicher existierenden Row. Kein Race: parallele Inserts kollidieren
  //       am Unique-Index uq_conversations_account_candidate und laufen in Schritt b zusammen.

  const windowExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Schritt a: INSERT neue Conversation wenn nicht vorhanden (ignoreDuplicates verhindert Fehler)
  await svc
    .from('conversations')
    .upsert(
      {
        agency_id: effectiveAgencyId,
        candidate_id: candidate.id,
        wa_account_id: waAccount.id,
        state: 'waiting',
        bot_step: 0,
        window_expires_at: windowExpires,
        last_message_at: now,
        updated_at: now,
      },
      { onConflict: 'wa_account_id,candidate_id', ignoreDuplicates: true }
    );

  // Schritt b: always-update-Felder setzen (sowohl neue als auch bestehende Row)
  const { data: conv, error: convErr } = await svc
    .from('conversations')
    .update({
      window_expires_at: windowExpires,
      last_message_at: now,
      updated_at: now,
    })
    .eq('wa_account_id', waAccount.id)
    .eq('candidate_id', candidate.id)
    .select('id, state, assigned_to')
    .single();

  if (convErr || !conv) throw new Error('Konversation konnte nicht erstellt oder aktualisiert werden');

  const conversationId: string = conv.id;
  const assignedTo: string | null = conv.assigned_to ?? null;

  // C3: unread_count atomar via DB-Funktion inkrementieren — mit agency_id-Scoping
  await svc.rpc('increment_unread', { p_conversation_id: conversationId, p_agency_id: effectiveAgencyId });

  // Fenster-Ablauf-Warnung planen (2h vor Ablauf, best effort).
  // Dedupe-Key enthält den Fenster-Zeitstempel: jede eingehende Nachricht verlängert das
  // Fenster und erzeugt einen neuen Job; veraltete Jobs sind No-Ops, weil processWindowExpiry
  // window_expires_at erneut prüft (> now+2h → return).
  const warnAt = new Date(new Date(windowExpires).getTime() - 2 * 60 * 60 * 1000).toISOString();
  const { error: winexpError } = await svc
    .from('scheduled_jobs')
    .upsert(
      {
        agency_id: effectiveAgencyId,
        run_at: warnAt,
        type: 'window.expiry',
        payload: { conversation_id: conversationId },
        status: 'pending',
        dedupe_key: `winexp:${conversationId}:${windowExpires}`,
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true }
    );
  if (winexpError) console.error('window.expiry-Planung fehlgeschlagen', winexpError);

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

  // Offene Application für Kandidaten nachschlagen (best effort)
  const { data: openApp } = await svc
    .from('applications')
    .select('id')
    .eq('agency_id', effectiveAgencyId)
    .eq('candidate_id', candidate.id)
    .eq('status', 'open')
    .order('applied_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const applicationId: string | undefined = (openApp as { id: string } | null)?.id ?? undefined;

  await fireEvent('message.received', effectiveAgencyId, {
    candidate_id: candidate.id,
    extra: { conversation_id: conversationId, body: bodyText },
  }, { application_id: applicationId, conversation_id: conversationId }).catch(() => {});

  // 5. STOP-Erkennung
  if (isStopMessage(msg.text?.body)) {
    // C4: Bestätigung ZUERST senden — opt_in ist noch true, Consent-Preflight wird bestanden.
    // Danach erst opt_in=false und Konversation schließen (damit sendWhatsAppMessage nicht
    // wegen fehlendem Consent abgewiesen wird).
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

    await svc.from('candidates')
      .update({ whatsapp_opt_in: false })
      .eq('id', candidate.id);

    await svc.from('conversations')
      .update({ state: 'closed', updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    return;
  }

  // Phase 3: Bot-Verarbeitung mit 8-Sekunden-Batching (P3-R3)
  if (conv.state === 'bot_active') {
    await cancelBotTimers(svc, { agencyId: effectiveAgencyId, conversationId });
    const { data: pendingJob } = await svc
      .from('scheduled_jobs')
      .select('id')
      .eq('agency_id', effectiveAgencyId)
      .eq('type', 'bot.process')
      .eq('status', 'pending')
      .eq('payload->>conversation_id', conversationId)
      .maybeSingle();
    if (!pendingJob) {
      await svc.from('scheduled_jobs').insert({
        agency_id: effectiveAgencyId,
        run_at: new Date(Date.now() + 8000).toISOString(),
        type: 'bot.process',
        payload: { conversation_id: conversationId },
        status: 'pending',
      });
    }
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
    // Zugewiesene Konversation — nur den Recruiter benachrichtigen
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
  } else {
    // I2: Unzugewiesene Konversation (neu ODER bestehend ohne assigned_to) —
    // immer an alle im Mandanten benachrichtigen, damit eingehende Nachrichten
    // nicht in einem unbeobachteten Posteingang verschwinden.
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
