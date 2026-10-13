/**
 * Sales-Bot: No-Show kommt aus Close, nicht aus Calendly.
 * Felix setzt die Opportunity in Close auf "Setting - No Show" oder "Closing - No Show" → Close-Webhook →
 * WhatsApp an den Prospect (einmal pro Opportunity):
 *   - Freigabe „noshow_rueckfrage“ an + Vorlage bei Meta freigegeben → noshow_setting_rueckfrage / noshow_closing_rueckfrage
 *     („Wann kann ich dich besser erreichen?“ + Fallstudie). Die Antwort wertet noshow-antwort.ts aus.
 *   - sonst Setting: alte Vorlage noshow_1_anruf(_v2) · Closing: keine Nachricht, nur Hinweis ans Team.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { notifySales } from './notify';
import { buildClickToken } from './tracking';
import { logActivity } from '@/lib/activity/log';
import { SALES_AGENCY_ID, SALES_WA_ACCOUNT_ID, normalizeToE164 } from './calendly-chain';
import { getCloseLeadContacts, addCloseNoteByEmail } from './close';
import { istFreigegeben } from '@/lib/freigaben';

export type NoShowResult =
  | 'sent'
  | 'already_sent'
  | 'no_contact_data'
  | 'prospect_not_found'
  | 'opted_out'
  | 'template_missing'
  | 'freigabe_aus';

export type NoShowArt = 'setting' | 'closing';

/** Vorlage je Art: neue Rückfrage (wenn freigegeben) vor der alten Setting-Vorlage (rein, testbar) */
export function waehleNoShowVorlage<T extends { preset_key: string }>(art: NoShowArt, freigegeben: boolean, vorlagen: T[]): T | null {
  const finde = (k: string) => vorlagen.find((t) => t.preset_key === k) ?? null;
  const neu = freigegeben ? finde(art === 'setting' ? 'noshow_setting_rueckfrage' : 'noshow_closing_rueckfrage') : null;
  if (neu || art === 'closing') return neu;
  return finde('noshow_1_anruf_v2') ?? finde('noshow_1_anruf');
}

interface Prospect {
  id: string;
  name: string;
  phone_e164: string | null;
  whatsapp_opt_in: boolean;
}

export async function handleCloseSettingNoShow(svc: SupabaseClient, input: { opportunityId: string; leadId: string }): Promise<NoShowResult> {
  return handleCloseNoShow(svc, { ...input, art: 'setting' });
}

export async function handleCloseNoShow(
  svc: SupabaseClient,
  input: { opportunityId: string; leadId: string; art: NoShowArt },
): Promise<NoShowResult> {
  const statusName = input.art === 'setting' ? 'Setting - No Show' : 'Closing - No Show';
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
      body: `Steht in Close auf "${statusName}", ist aber keinem WhatsApp-Kontakt zugeordnet (Telefon/E-Mail in Close prüfen). Keine Nachricht gesendet.`,
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

  const freigegeben = await istFreigegeben(svc, 'noshow_rueckfrage');
  const { data: approvedNoShow } = await svc
    .from('whatsapp_templates')
    .select('id, name, preset_key')
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('wa_account_id', SALES_WA_ACCOUNT_ID)
    .in('preset_key', ['noshow_setting_rueckfrage', 'noshow_closing_rueckfrage', 'noshow_1_anruf_v2', 'noshow_1_anruf'])
    .eq('status', 'approved');
  const tmpl = waehleNoShowVorlage(input.art, freigegeben, (approvedNoShow ?? []) as Array<{ id: string; name: string; preset_key: string }>);
  if (!tmpl) {
    const grund = input.art === 'closing' && !freigegeben ? 'freigabe_aus' : 'template_missing';
    await notifySales(svc, {
      emoji: input.art === 'closing' ? '👻' : '⚠️',
      title: input.art === 'closing' ? `Closing-No-Show: ${prospect.name}` : 'WhatsApp-Vorlage fehlt',
      body:
        grund === 'freigabe_aus'
          ? 'Keine WhatsApp gesendet (Freigabe „No-Show-Rückfrage“ ist aus). Bitte anrufen und neuen Termin mit allen Entscheidern legen.'
          : `Vorlage für ${statusName} ist bei Meta nicht freigegeben — keine Nachricht an ${prospect.name} gesendet. Bitte anrufen.`,
      type: input.art === 'closing' ? 'noshow' : 'system',
      phone: prospect.phone_e164,
    });
    return grund;
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
  // {{1}} vorname; Rückfrage-Vorlagen und noshow_1_anruf haben nur statische Buttons, v2 einen Tracking-Parameter
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
    action: `No-Show-Nachricht gesendet (Close: ${statusName})`,
    // activity_log.action_type hat eine CHECK-Liste — Sales-Typ steht in metadata.kind
    action_type: 'other',
    metadata: { kind: 'sales_noshow_sent', close_opportunity_id: input.opportunityId, close_lead_id: input.leadId, art: input.art, vorlage: template.name },
  });

  const { data: p } = await svc.from('candidates').select('email').eq('id', prospect.id).maybeSingle();
  await addCloseNoteByEmail(
    (p as { email: string | null } | null)?.email ?? contacts.emails[0] ?? null,
    `WhatsApp: No-Show-Nachricht (${template.name}) gesendet.`,
  ).catch(() => {});

  await notifySales(svc, {
    emoji: '👻',
    title: `No-Show: ${prospect.name}`,
    body: `In Close auf "${statusName}" gesetzt — WhatsApp ${template.name} ist raus.${template.name.endsWith('_rueckfrage') ? ' Die Antwort landet als Aufgabe in Close.' : ''}`,
    type: 'noshow',
    phone: prospect.phone_e164,
    conversationId,
  });

  return 'sent';
}
