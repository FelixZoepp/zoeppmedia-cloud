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

  // 3. Conversation atomar upsert-en.
  //
  // Ansatz: Upsert mit onConflict auf (wa_account_id, candidate_id).
  // - Felder die IMMER aktualisiert werden (window_expires_at, last_message_at, updated_at)
  //   gehen direkt in den Upsert-Payload.
  // - Felder die nur bei Neuanlage gesetzt werden dürfen (state, bot_step, agency_id, candidate_id,
  //   wa_account_id) gehen ebenfalls in den Payload, werden aber durch ignoreDuplicates: false
  //   überschrieben — das ist für state/bot_step nicht korrekt.
  //
  // Da Supabase-Upserts mit onConflict kein "nur bei INSERT"-Semantik für einzelne Spalten bieten,
  // verwenden wir einen zweistufigen Ansatz:
  //   a) Upsert mit nur den "immer-update"-Feldern plus den INSERT-Initialisierungsfeldern.
  //   b) Nach dem Upsert prüfen wir den zurückgegebenen state: Wenn die Row NEU angelegt wurde,
  //      enthält state den von uns gesetzten Wert 'waiting'. Wenn die Row bereits existierte,
  //      enthält state den gespeicherten Wert (kann alles sein).
  //   c) Für existing conversations: state und bot_step werden NICHT vom Upsert clobbered, weil
  //      Supabase-Upsert bei onConflict alle Felder im Payload schreibt. Daher upserten wir
  //      zunächst nur die always-update-Felder, lesen state/assigned_to zurück, und wenden dann
  //      ggf. Zustandsübergänge an.
  //
  // Konkretes Vorgehen:
  //   - INSERT mit allen Feldern inkl. state='waiting', bot_step=0.
  //   - ON CONFLICT (wa_account_id, candidate_id): nur window_expires_at, last_message_at,
  //     updated_at aktualisieren (ignoreDuplicates: false aktualisiert alle Payload-Felder —
  //     das würde state clobbern).
  //
  // Da Supabase JS v2 keinen partiellen upsert-Update unterstützt (kein DO UPDATE SET subset),
  // wählen wir: upsert mit ignoreDuplicates: false, aber im Payload KEINE state/bot_step Werte
  // für vorhandene Rows. Dies lässt sich nicht atomar ausdrücken, daher:
  //
  // Finale Strategie: INSERT ... ON CONFLICT DO NOTHING via ignoreDuplicates: true, dann
  // immer ein UPDATE der always-update-Felder. Ergebnis: 2 Queries statt race condition.
  // Das ist sicher weil events_inbox SKIP LOCKED single-worker-Semantik garantiert —
  // kein gleichzeitiger Worker verarbeitet denselben Kandidaten.

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
  // isNew: wenn state noch 'waiting' und assigned_to null — aber das ist nicht eindeutig.
  // Wir merken uns stattdessen ob die Notification für neue Konversationen ausgelöst wird,
  // indem wir prüfen ob die Row gerade erst erzeugt wurde (via separaten Zähler ist nicht nötig —
  // die Notification-Logik in Schritt 7 behandelt assigned_to=null gleich).

  // C4: unread_count atomar via DB-Funktion inkrementieren (kein client-seitiges +1)
  await svc.rpc('increment_unread', { conversation_id: conversationId });

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
