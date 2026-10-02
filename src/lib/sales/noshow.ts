/**
 * Sales-Bot: No-Show kommt aus Close, nicht aus Calendly.
 * Felix setzt die Opportunity in Close auf "Setting - No Show" → Close-Webhook →
 * WhatsApp-Vorlage noshow_1_anruf an den Prospect (einmal pro Opportunity).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { notifySales } from './notify';
import { buildClickToken } from './tracking';
import { logActivity } from '@/lib/activity/log';
import { SALES_AGENCY_ID, SALES_WA_ACCOUNT_ID, normalizeToE164 } from './calendly-chain';
import { getCloseLeadContacts, addCloseNoteByEmail } from './close';

export type NoShowResult =
  | 'sent'
  | 'already_sent'
  | 'no_contact_data'
  | 'prospect_not_found'
  | 'opted_out'
  | 'template_missing';

interface Prospect {
  id: string;
  name: string;
  phone_e164: string | null;
  whatsapp_opt_in: boolean;
}

export async function handleCloseSettingNoShow(
  svc: SupabaseClient,
  input: { opportunityId: string; leadId: string },
): Promise<NoShowResult> {
  const contacts = await getCloseLeadContacts(input.leadId);
  if (!contacts) return 'no_contact_data';

  // Prospect über Telefonnummer, sonst über E-Mail finden
  const phones = contacts.phones.map(normalizeToE164).filter((p): p is string => !!p);
  let prospect: Prospect | null = null;

  if (phones.length) {
    const { data } = await svc
      .from('candidates')
      .select('id, name, phone_e164, whatsapp_opt_in')
      .eq('agency_id', SALES_AGENCY_ID)
      .in('phone_e164', phones)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    prospect = data as Prospect | null;
  }
  if (!prospect && contacts.emails.length) {
    const { data } = await svc
      .from('candidates')
      .select('id, name, phone_e164, whatsapp_opt_in')
      .eq('agency_id', SALES_AGENCY_ID)
      .in('email', contacts.emails)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    prospect = data as Prospect | null;
  }

  const leadLabel = contacts.contactName ?? contacts.leadName ?? input.leadId;

  if (!prospect?.phone_e164) {
    await notifySales(svc, {
      emoji: '⚠️',
      title: `No-Show ohne WhatsApp-Kontakt: ${leadLabel}`,
      body: 'Steht in Close auf "Setting - No Show", ist aber keinem WhatsApp-Kontakt zugeordnet (Telefon/E-Mail in Close prüfen). Keine Nachricht gesendet.',
      type: 'noshow',
    });
    return 'prospect_not_found';
  }
  if (!prospect.whatsapp_opt_in) return 'opted_out';

  // Einmal pro Opportunity — wiederholtes Umsetzen des Status schickt nicht erneut
  const { data: already } = await svc
    .from('activity_log')
    .select('id')
    .eq('candidate_id', prospect.id)
    .eq('metadata->>kind', 'sales_noshow_sent')
    .eq('metadata->>close_opportunity_id', input.opportunityId)
    .limit(1)
    .maybeSingle();
  if (already) return 'already_sent';

  // noshow_1_anruf_v2 (Button mit Klick-Tracking) bevorzugen, sonst die ursprüngliche Vorlage
  const { data: approvedNoShow } = await svc
    .from('whatsapp_templates')
    .select('id, name, preset_key')
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('wa_account_id', SALES_WA_ACCOUNT_ID)
    .in('preset_key', ['noshow_1_anruf_v2', 'noshow_1_anruf'])
    .eq('status', 'approved');
  const noShowTemplates = (approvedNoShow ?? []) as Array<{ id: string; name: string; preset_key: string }>;
  const tmpl =
    noShowTemplates.find((t) => t.preset_key === 'noshow_1_anruf_v2') ??
    noShowTemplates.find((t) => t.preset_key === 'noshow_1_anruf') ??
    null;
  if (!tmpl) {
    await notifySales(svc, {
      emoji: '⚠️',
      title: 'WhatsApp-Vorlage fehlt',
      body: `noshow_1_anruf ist nicht freigegeben — No-Show-Nachricht an ${prospect.name} wurde nicht gesendet.`,
      type: 'system',
      phone: prospect.phone_e164,
    });
    return 'template_missing';
  }
  const template = tmpl as { id: string; name: string };

  // Konversation sicherstellen (Prospect kann z.B. über eine ältere Buchung angelegt sein)
  await svc.from('conversations').upsert(
    { agency_id: SALES_AGENCY_ID, candidate_id: prospect.id, wa_account_id: SALES_WA_ACCOUNT_ID, state: 'human_active' },
    { onConflict: 'wa_account_id,candidate_id', ignoreDuplicates: true },
  );
  const { data: conv } = await svc
    .from('conversations')
    .select('id')
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('wa_account_id', SALES_WA_ACCOUNT_ID)
    .eq('candidate_id', prospect.id)
    .single();
  const conversationId = (conv as { id: string }).id;

  const vorname = (prospect.name || '').split(' ')[0] || 'du';
  // noshow_1_anruf: {{1}} vorname; Buttons: Quick-Reply + statischer URL-Button (keine Parameter)
  await sendWhatsAppMessage(svc, {
    agencyId: SALES_AGENCY_ID,
    conversationId,
    candidatePhone: prospect.phone_e164,
    waAccountId: SALES_WA_ACCOUNT_ID,
    payload: {
      to: prospect.phone_e164,
      type: 'template',
      template: {
        name: template.name,
        language: { code: 'de' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: vorname }] },
          // v2: URL-Button (index 1, nach dem Quick-Reply) → Tracking-Link zum Analysegespräch
          ...(template.name === 'noshow_1_anruf_v2'
            ? [{
                type: 'button',
                sub_type: 'url',
                index: '1',
                parameters: [{ type: 'text', text: buildClickToken(prospect.id, 'setting', 'noshow_1_anruf_v2') }],
              }]
            : []),
        ],
      },
    },
    senderType: 'system',
    templateId: template.id,
  });

  await logActivity(svc, {
    agency_id: SALES_AGENCY_ID,
    candidate_id: prospect.id,
    action: 'No-Show-Nachricht gesendet (Close: Setting - No Show)',
    // activity_log.action_type hat eine CHECK-Liste — Sales-Typ steht in metadata.kind
    action_type: 'other',
    metadata: { kind: 'sales_noshow_sent', close_opportunity_id: input.opportunityId, close_lead_id: input.leadId },
  });

  const { data: p } = await svc.from('candidates').select('email').eq('id', prospect.id).maybeSingle();
  await addCloseNoteByEmail(
    (p as { email: string | null } | null)?.email ?? contacts.emails[0] ?? null,
    'WhatsApp: No-Show-Nachricht (noshow_1_anruf) automatisch gesendet.',
  ).catch(() => {});

  await notifySales(svc, {
    emoji: '👻',
    title: `No-Show: ${prospect.name}`,
    body: 'In Close auf "Setting - No Show" gesetzt — WhatsApp noshow_1_anruf ist raus.',
    type: 'noshow',
    phone: prospect.phone_e164,
    conversationId,
  });

  return 'sent';
}
