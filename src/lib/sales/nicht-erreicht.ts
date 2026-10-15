/**
 * Terminierung „Niemand / Mailbox“ → WhatsApp „Hey …, Felix Zoepp hier … Wann kann ich dich besser erreichen?“
 * (Vorlage nicht_erreicht_rueckfrage). Nur mit Freigabe „nicht_erreicht_rueckfrage“ und nur an Leads, die sich selbst
 * über einen Funnel eingetragen haben (sales_eintragungen) – keine Kaltakquise. Höchstens einmal in 7 Tagen,
 * nicht bei gebuchtem Termin / aktiver Opportunity / STOP, Ruhezeit 20:30–8:00 Uhr → 8:30 Uhr.
 * Die Antwort wertet noshow-antwort.ts aus (Wunschzeit → Close-Aufgabe + Slack); dafür wird der Versand
 * als „sales_noshow_sent“ mit art „nicht_erreicht“ geloggt.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { logActivity } from '@/lib/activity/log';
import { istFreigegeben } from '@/lib/freigaben';
import { ensureSalesProspect, normalizeToE164, SALES_AGENCY_ID, SALES_WA_ACCOUNT_ID } from './calendly-chain';
import { findeBuchung } from './eintragungen';
import { versandZeit } from './eintrag-kette';
import { addCloseNote } from './close';

const CLOSE_BASE = 'https://api.close.com/api/v1';
export const VORLAGE = 'nicht_erreicht_rueckfrage';
const SPERRE_TAGE = 7;

export type NichtErreichtErgebnis =
  | 'gesendet'
  | 'freigabe_aus'
  | 'kein_funnel_lead'
  | 'schon_gesendet'
  | 'gebucht'
  | 'opportunity'
  | 'keine_nummer'
  | 'abgemeldet'
  | 'vorlage_fehlt'
  | 'verschoben';

/** Nach dem Protokoll „Niemand / Mailbox“ planen (nur mit Freigabe, sonst kein Job) */
export async function planeNichtErreicht(svc: SupabaseClient, leadId: string, jetzt: Date = new Date()): Promise<boolean> {
  if (!(await istFreigegeben(svc, 'nicht_erreicht_rueckfrage'))) return false;
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'sales.nicht_erreicht',
    run_at: versandZeit(new Date(jetzt.getTime() + 2 * 60_000)).toISOString(),
    payload: { lead_id: leadId },
    status: 'pending',
    dedupe_key: `sales.nicht_erreicht:${leadId}:${jetzt.toISOString().slice(0, 10)}`,
  });
  if (error && error.code !== '23505') throw new Error(`Nicht-erreicht-Nachricht nicht geplant: ${error.message}`);
  return !error;
}

async function hatAktiveOpportunity(leadId: string): Promise<boolean> {
  const res = await fetch(`${CLOSE_BASE}/opportunity/?lead_id=${leadId}&status_type=active&_fields=id`, {
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Close-Opportunities nicht lesbar (${res.status})`);
  return ((await res.json()) as { data: unknown[] }).data.length > 0;
}

/** Job sales.nicht_erreicht */
export async function sendeNichtErreicht(svc: SupabaseClient, payload: { lead_id: string }, jetzt: Date = new Date()): Promise<NichtErreichtErgebnis> {
  if (!(await istFreigegeben(svc, 'nicht_erreicht_rueckfrage'))) return 'freigabe_aus';

  const { data } = await svc.from('sales_eintragungen').select('lead_id, name, email, phone, eingetragen_am, gebucht_am, ergebnis').eq('lead_id', payload.lead_id).maybeSingle();
  const e = data as { lead_id: string; name: string | null; email: string | null; phone: string | null; eingetragen_am: string; gebucht_am: string | null; ergebnis: string | null } | null;
  if (!e || e.ergebnis === 'manuell') return 'kein_funnel_lead';

  if (versandZeit(jetzt).getTime() !== jetzt.getTime()) {
    await svc.from('scheduled_jobs').insert({
      agency_id: SALES_AGENCY_ID,
      type: 'sales.nicht_erreicht',
      run_at: versandZeit(jetzt).toISOString(),
      payload,
      status: 'pending',
      dedupe_key: `sales.nicht_erreicht:${e.lead_id}:verschoben:${versandZeit(jetzt).toISOString().slice(0, 10)}`,
    });
    return 'verschoben';
  }

  if (e.gebucht_am || (await findeBuchung(svc, e))) return 'gebucht';
  if (await hatAktiveOpportunity(e.lead_id)) return 'opportunity';

  const nummer = normalizeToE164(e.phone);
  if (!nummer) return 'keine_nummer';
  const { data: vorhanden } = await svc.from('candidates').select('id, whatsapp_opt_in').eq('agency_id', SALES_AGENCY_ID).eq('phone_e164', nummer).is('deleted_at', null).limit(1).maybeSingle();
  const alt = vorhanden as { id: string; whatsapp_opt_in: boolean } | null;
  if (alt && !alt.whatsapp_opt_in) return 'abgemeldet';
  const prospectId = alt?.id ?? (await ensureSalesProspect(svc, nummer, e.name ?? 'Lead', e.email));
  if (!prospectId) return 'keine_nummer';

  // Höchstens einmal in 7 Tagen
  const { count } = await svc
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('candidate_id', prospectId)
    .eq('metadata->>kind', 'sales_noshow_sent')
    .eq('metadata->>vorlage', VORLAGE)
    .gte('created_at', new Date(jetzt.getTime() - SPERRE_TAGE * 864e5).toISOString());
  if (count) return 'schon_gesendet';

  const { data: t } = await svc.from('whatsapp_templates').select('id, name').eq('wa_account_id', SALES_WA_ACCOUNT_ID).eq('preset_key', VORLAGE).eq('status', 'approved').maybeSingle();
  const tmpl = t as { id: string; name: string } | null;
  if (!tmpl) return 'vorlage_fehlt';

  await svc.from('conversations').upsert(
    { agency_id: SALES_AGENCY_ID, candidate_id: prospectId, wa_account_id: SALES_WA_ACCOUNT_ID, state: 'human_active' },
    { onConflict: 'wa_account_id,candidate_id', ignoreDuplicates: true },
  );
  const { data: conv } = await svc.from('conversations').select('id').eq('wa_account_id', SALES_WA_ACCOUNT_ID).eq('candidate_id', prospectId).single();
  const conversationId = (conv as { id: string }).id;

  const vorname = (e.name ?? '').trim().split(/\s+/)[0] || 'du';
  await sendWhatsAppMessage(svc, {
    agencyId: SALES_AGENCY_ID,
    conversationId,
    candidatePhone: nummer,
    waAccountId: SALES_WA_ACCOUNT_ID,
    payload: {
      to: nummer,
      type: 'template',
      template: { name: tmpl.name, language: { code: 'de' }, components: [{ type: 'body', parameters: [{ type: 'text', text: vorname }] }] },
    },
    senderType: 'system',
    templateId: tmpl.id,
  });
  await logActivity(svc, {
    agency_id: SALES_AGENCY_ID,
    candidate_id: prospectId,
    action: 'Nicht erreicht – WhatsApp „Wann kann ich dich besser erreichen?“ gesendet',
    action_type: 'other',
    metadata: { kind: 'sales_noshow_sent', art: 'nicht_erreicht', vorlage: VORLAGE, close_lead_id: e.lead_id },
  });
  await addCloseNote(e.lead_id, 'WhatsApp: „Nicht erreicht – wann kann ich dich besser erreichen?“ gesendet.').catch(() => {});
  return 'gesendet';
}
