/**
 * Sales-Bot: eingehende WhatsApp-Nachrichten auf der Sales-Nummer (030 82684175).
 *
 * Komplett getrennt vom Recruiting-Inbound (workers/whatsapp-inbound.ts):
 * kein Recruiting-Bot, keine Bewerbungen, keine Automations-Engine, keine
 * Recruiting-SLA-Jobs. Gemeinsam genutzt wird nur die WhatsApp-Infrastruktur
 * (Konversationen/Nachrichten für die Inbox, Versand, STOP-Erkennung).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isStopMessage } from '@/lib/whatsapp/window';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { handleSalesReply } from './replies';
import { SALES_AGENCY_ID } from './calendly-chain';

export interface SalesInboundMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  /** Quick-Reply-Button einer Vorlage (z.B. "Ja, ich bin dabei") */
  button?: { text: string; payload?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  image?: { id: string; caption?: string };
  document?: { id: string; caption?: string };
  audio?: { id: string };
}

/** Lesbarer Text einer eingehenden Nachricht — inkl. Button-Antworten. */
export function inboundText(msg: SalesInboundMessage): string {
  return (
    msg.text?.body ||
    msg.button?.text ||
    msg.interactive?.button_reply?.title ||
    msg.interactive?.list_reply?.title ||
    msg.image?.caption ||
    (msg.type === 'image' ? '[Bild]' : '') ||
    msg.document?.caption ||
    (msg.type === 'document' ? '[Dokument]' : '') ||
    (msg.type === 'audio' ? '[Sprachnachricht]' : '') ||
    ''
  );
}

export interface SalesInboundPayload {
  type: 'whatsapp.inbound';
  phone_number_id: string;
  message: SalesInboundMessage;
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
}

export async function processSalesInbound(svc: SupabaseClient, payload: SalesInboundPayload): Promise<void> {
  const msg = payload.message;
  const profileName = payload.contacts?.[0]?.profile?.name ?? null;

  const { data: account } = await svc
    .from('whatsapp_accounts')
    .select('id, agency_id')
    .eq('phone_number_id', payload.phone_number_id)
    .eq('agency_id', SALES_AGENCY_ID)
    .maybeSingle();
  if (!account) throw new Error(`Sales-WhatsApp-Konto für phone_number_id ${payload.phone_number_id} nicht gefunden`);
  const waAccount = account as { id: string; agency_id: string };
  const agencyId = waAccount.agency_id;
  const senderPhone = msg.from.startsWith('+') ? msg.from : `+${msg.from}`;
  const text = inboundText(msg);

  // Prospect über die Nummer finden (angelegt bei der Calendly-Buchung)
  const { data: prospect } = await svc
    .from('candidates')
    .select('id, name')
    .eq('agency_id', agencyId)
    .eq('phone_e164', senderPhone)
    .is('deleted_at', null)
    .maybeSingle();

  if (!prospect) {
    // Unbekannte Nummer schreibt die Sales-Nummer an → Felix Bescheid geben, nichts speichern
    await createNotificationForInternals(svc, {
      agency_id: agencyId,
      title: `Sales: WhatsApp von unbekannter Nummer ${senderPhone}`,
      body: `${profileName ? `${profileName}: ` : ''}${text.slice(0, 100)}`,
      type: 'whatsapp_inbound',
    }).catch(() => {});
    return;
  }

  const now = new Date().toISOString();
  const windowExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Konversation sicherstellen — state 'human_active': Sales hat keinen Bot-Dialog
  await svc
    .from('conversations')
    .upsert(
      { agency_id: agencyId, candidate_id: prospect.id, wa_account_id: waAccount.id, state: 'human_active' },
      { onConflict: 'wa_account_id,candidate_id', ignoreDuplicates: true },
    );

  const { data: conv, error: convErr } = await svc
    .from('conversations')
    .update({ window_expires_at: windowExpires, last_message_at: now, updated_at: now })
    .eq('wa_account_id', waAccount.id)
    .eq('candidate_id', prospect.id)
    .select('id')
    .single();

  if (convErr || !conv) throw new Error('Sales-Konversation konnte nicht erstellt oder aktualisiert werden');
  const conversationId = (conv as { id: string }).id;

  await svc.rpc('increment_unread', { p_conversation_id: conversationId, p_agency_id: agencyId });

  const messageType = (['text', 'image', 'document', 'audio'].includes(msg.type) ? msg.type : 'text') as
    'text' | 'image' | 'document' | 'audio';

  await svc.from('messages').insert({
    agency_id: agencyId,
    conversation_id: conversationId,
    direction: 'in',
    sender_type: 'candidate',
    type: messageType,
    body: text,
    wa_message_id: msg.id,
    status: 'delivered',
  });

  // Medien in die Inbox laden (gemeinsamer WhatsApp-Media-Job)
  const mediaId = msg.image?.id || msg.document?.id || msg.audio?.id;
  if (mediaId) {
    await svc.from('scheduled_jobs').insert({
      agency_id: agencyId,
      run_at: now,
      type: 'media.download',
      payload: { media_id: mediaId, message_id: msg.id, conversation_id: conversationId, wa_account_id: waAccount.id },
      status: 'pending',
    });
  }

  // STOP → Abmeldung bestätigen, danach keine Nachrichten mehr
  if (isStopMessage(msg.text?.body)) {
    await sendWhatsAppMessage(svc, {
      agencyId,
      conversationId,
      candidatePhone: senderPhone,
      waAccountId: waAccount.id,
      payload: {
        to: senderPhone,
        type: 'text',
        text: { body: 'Alles klar, du bekommst von uns keine weiteren Nachrichten mehr.' },
      },
      senderType: 'system',
      isHumanUiSend: true,
    }).catch(() => {});

    // Offene Sales-Jobs laufen leer: sales-reminders prüft whatsapp_opt_in vor jedem Versand
    await svc.from('candidates').update({ whatsapp_opt_in: false }).eq('id', prospect.id).eq('agency_id', agencyId);
    return;
  }

  await handleSalesReply(svc, {
    agencyId,
    candidateId: prospect.id,
    candidateName: prospect.name,
    candidatePhone: senderPhone,
    conversationId,
    waAccountId: waAccount.id,
    text,
  }).catch((err) => console.error('[sales] Antwort-Verarbeitung fehlgeschlagen:', err));

  await createNotificationForInternals(svc, {
    agency_id: agencyId,
    title: `Sales: Neue WhatsApp-Nachricht von ${prospect.name}`,
    body: text.slice(0, 100),
    type: 'whatsapp_inbound',
    entity_type: 'candidate',
    entity_id: prospect.id,
    push_url: `/api/admin/sales-inbox?conversation=${conversationId}`,
  }).catch(() => {});
}
