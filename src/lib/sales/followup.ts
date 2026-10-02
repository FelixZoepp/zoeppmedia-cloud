/**
 * Sales-Bot: WhatsApp-Follow-ups, gesteuert aus Close.
 *
 * Läuft, solange die Opportunity auf "Setting - Follow Up" / "Closing - Follow Up"
 * steht UND im Feld "Follow-up-Rhythmus" ein Abstand gewählt ist (1 Woche,
 * 2 Wochen, 1 Monat, 3 Monate). Pro Abstand geht die nächste Vorlage der Reihe raus:
 *   fu_1 → fu_2 → fu_3 → fu_4_frage → fu_5 → fu_6_abschied
 * Vorlagen, die (noch) nicht freigegeben sind, werden übersprungen.
 *
 * Stopp: Status weg von "Follow Up", Rhythmus "Aus"/leer, STOP, Kette durch.
 * Pause: Der Lead antwortet → keine weiteren Follow-ups, Slack + Aufgabe in Close.
 *        Rhythmus in Close neu auswählen → es geht mit dem nächsten Schritt weiter.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { logActivity } from '@/lib/activity/log';
import { SALES_AGENCY_ID, SALES_WA_ACCOUNT_ID, normalizeToE164, ensureSalesProspect } from './calendly-chain';
import {
  CLOSE_FOLLOWUP_STATUS_IDS,
  getCloseOpportunity,
  getCloseLeadContacts,
  addCloseTask,
  addCloseNoteByEmail,
  type CloseOpportunity,
} from './close';
import { notifySales } from './notify';

export const FOLLOWUP_SEQUENCE = ['fu_1', 'fu_2', 'fu_3', 'fu_4_frage', 'fu_5', 'fu_6_abschied'] as const;

const RHYTHMS: Record<string, { days?: number; months?: number }> = {
  '1 Woche': { days: 7 },
  '2 Wochen': { days: 14 },
  '1 Monat': { months: 1 },
  '3 Monate': { months: 3 },
};

export function isActiveFollowup(opp: Pick<CloseOpportunity, 'statusId' | 'rhythm'>): boolean {
  return CLOSE_FOLLOWUP_STATUS_IDS.includes(opp.statusId) && !!opp.rhythm && opp.rhythm in RHYTHMS;
}

/** Nächster Versandzeitpunkt: Abstand ab jetzt, Uhrzeit 08:00 UTC (≈ 10 Uhr deutsche Zeit). */
export function nextFollowupRun(now: Date, rhythm: string): Date {
  const r = RHYTHMS[rhythm];
  const d = new Date(now.getTime());
  if (r?.days) d.setUTCDate(d.getUTCDate() + r.days);
  if (r?.months) d.setUTCMonth(d.getUTCMonth() + r.months);
  d.setUTCHours(8, 0, 0, 0);
  return d;
}

function formatDatum(d: Date): string {
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
}

export interface FollowupJobPayload {
  opportunity_id: string;
  lead_id: string;
  prospect_id: string;
  rhythm: string;
}

async function pendingFollowupJobs(svc: SupabaseClient, filter: { opportunityId?: string; prospectId?: string }) {
  let q = svc
    .from('scheduled_jobs')
    .select('id, run_at, payload')
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('type', 'sales.followup')
    .eq('status', 'pending');
  if (filter.opportunityId) q = q.eq('payload->>opportunity_id', filter.opportunityId);
  if (filter.prospectId) q = q.eq('payload->>prospect_id', filter.prospectId);
  const { data } = await q;
  return (data ?? []) as Array<{ id: string; run_at: string; payload: FollowupJobPayload }>;
}

async function cancelJobs(svc: SupabaseClient, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await svc
    .from('scheduled_jobs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .in('id', ids);
}

/** Index der zuletzt gesendeten Vorlage dieser Opportunity (−1 = noch keine). */
async function lastSentIndex(svc: SupabaseClient, prospectId: string, opportunityId: string): Promise<number> {
  const { data } = await svc
    .from('activity_log')
    .select('metadata')
    .eq('candidate_id', prospectId)
    .eq('metadata->>kind', 'sales_followup_sent')
    .eq('metadata->>close_opportunity_id', opportunityId);
  const steps = ((data ?? []) as Array<{ metadata: { step?: number } }>).map((r) => r.metadata.step ?? -1);
  return steps.length ? Math.max(...steps) : -1;
}

/** Prospect zum Close-Lead finden oder aus der Close-Nummer anlegen (Perspective-Leads ohne Buchung). */
async function prospectForLead(
  svc: SupabaseClient,
  leadId: string,
): Promise<{ id: string; name: string; phone_e164: string; whatsapp_opt_in: boolean; email: string | null } | null> {
  const contacts = await getCloseLeadContacts(leadId);
  if (!contacts) return null;
  const phone = contacts.phones.map(normalizeToE164).find((p): p is string => !!p);
  if (!phone) return null;

  const id = await ensureSalesProspect(svc, phone, contacts.contactName ?? contacts.leadName ?? 'Unbekannt', contacts.emails[0] ?? null);
  if (!id) return null;
  const { data } = await svc
    .from('candidates')
    .select('id, name, phone_e164, whatsapp_opt_in, email')
    .eq('id', id)
    .maybeSingle();
  return data as { id: string; name: string; phone_e164: string; whatsapp_opt_in: boolean; email: string | null } | null;
}

/**
 * Close hat eine Opportunity angelegt/geändert → Follow-up-Kette starten, umplanen oder stoppen.
 */
export async function syncFollowupForOpportunity(
  svc: SupabaseClient,
  opportunityId: string,
  now: Date = new Date(),
): Promise<'started' | 'rescheduled' | 'unchanged' | 'stopped' | 'inactive' | 'no_whatsapp' | 'completed'> {
  const opp = await getCloseOpportunity(opportunityId);
  const pending = await pendingFollowupJobs(svc, { opportunityId });

  if (!opp || !isActiveFollowup(opp)) {
    if (!pending.length) return 'inactive';
    await cancelJobs(svc, pending.map((j) => j.id));
    await notifySales(svc, {
      emoji: '⏹️',
      title: `Follow-ups gestoppt: ${opp?.leadName ?? opportunityId}`,
      body: opp ? `Status "${opp.statusLabel ?? ''}" / Rhythmus "${opp.rhythm ?? 'leer'}" in Close.` : 'Opportunity existiert nicht mehr.',
      type: 'system',
    });
    return 'stopped';
  }

  const rhythm = opp.rhythm!;
  if (pending.length) {
    const job = pending[0];
    if (job.payload.rhythm === rhythm) return 'unchanged';
    const runAt = nextFollowupRun(now, rhythm);
    await svc
      .from('scheduled_jobs')
      .update({ run_at: runAt.toISOString(), payload: { ...job.payload, rhythm }, updated_at: now.toISOString() })
      .eq('id', job.id);
    await notifySales(svc, {
      emoji: '🔁',
      title: `Follow-up-Rhythmus geändert: ${opp.leadName ?? ''}`,
      body: `Jetzt alle ${rhythm}, nächstes Follow-up am ${formatDatum(runAt)}.`,
      type: 'system',
    });
    return 'rescheduled';
  }

  const prospect = await prospectForLead(svc, opp.leadId);
  if (!prospect) {
    await notifySales(svc, {
      emoji: '⚠️',
      title: `Follow-ups nicht möglich: ${opp.leadName ?? ''}`,
      body: 'Der Lead hat in Close keine gültige Handynummer — keine WhatsApp-Follow-ups.',
      type: 'system',
    });
    return 'no_whatsapp';
  }

  if ((await lastSentIndex(svc, prospect.id, opp.id)) >= FOLLOWUP_SEQUENCE.length - 1) return 'completed';

  const runAt = nextFollowupRun(now, rhythm);
  await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'sales.followup',
    run_at: runAt.toISOString(),
    payload: { opportunity_id: opp.id, lead_id: opp.leadId, prospect_id: prospect.id, rhythm } satisfies FollowupJobPayload,
    status: 'pending',
  });
  await notifySales(svc, {
    emoji: '🔁',
    title: `Follow-ups gestartet: ${prospect.name}`,
    body: `${opp.leadName ? `${opp.leadName} · ` : ''}alle ${rhythm}, erstes Follow-up am ${formatDatum(runAt)}.`,
    type: 'system',
    phone: prospect.phone_e164,
  });
  return 'started';
}

/** Job sales.followup: nächste freigegebene Vorlage senden und den Folgeschritt planen. */
export async function processSalesFollowup(
  svc: SupabaseClient,
  payload: FollowupJobPayload,
  now: Date = new Date(),
): Promise<'sent' | 'inactive' | 'opted_out' | 'completed'> {
  const opp = await getCloseOpportunity(payload.opportunity_id);
  if (!opp || !isActiveFollowup(opp)) return 'inactive';

  const { data: p } = await svc
    .from('candidates')
    .select('id, name, phone_e164, whatsapp_opt_in, email')
    .eq('id', payload.prospect_id)
    .eq('agency_id', SALES_AGENCY_ID)
    .maybeSingle();
  const prospect = p as { id: string; name: string; phone_e164: string | null; whatsapp_opt_in: boolean; email: string | null } | null;
  if (!prospect?.phone_e164 || !prospect.whatsapp_opt_in) return 'opted_out';

  // Nächste freigegebene Vorlage nach der zuletzt gesendeten
  const last = await lastSentIndex(svc, prospect.id, opp.id);
  const { data: approved } = await svc
    .from('whatsapp_templates')
    .select('id, name, preset_key')
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('wa_account_id', SALES_WA_ACCOUNT_ID)
    .eq('status', 'approved')
    .in('preset_key', [...FOLLOWUP_SEQUENCE]);
  const byKey = new Map(((approved ?? []) as Array<{ id: string; name: string; preset_key: string }>).map((t) => [t.preset_key, t]));
  const step = FOLLOWUP_SEQUENCE.findIndex((key, i) => i > last && byKey.has(key));

  if (step === -1) {
    await notifySales(svc, {
      emoji: '🏁',
      title: `Follow-up-Kette beendet: ${prospect.name}`,
      body: 'Alle Follow-ups sind raus. In Close nächsten Schritt festlegen.',
      type: 'system',
      phone: prospect.phone_e164,
    });
    return 'completed';
  }

  const template = byKey.get(FOLLOWUP_SEQUENCE[step])!;
  const contacts = await getCloseLeadContacts(opp.leadId).catch(() => null);
  const vorname = (contacts?.contactName ?? prospect.name ?? '').split(' ')[0] || 'du';
  const firma = opp.leadName || contacts?.leadName || 'euer Unternehmen';
  const params = FOLLOWUP_SEQUENCE[step] === 'fu_4_frage' ? [vorname, firma] : [vorname];

  await svc.from('conversations').upsert(
    { agency_id: SALES_AGENCY_ID, candidate_id: prospect.id, wa_account_id: SALES_WA_ACCOUNT_ID, state: 'human_active' },
    { onConflict: 'wa_account_id,candidate_id', ignoreDuplicates: true },
  );
  const { data: conv } = await svc
    .from('conversations')
    .select('id')
    .eq('wa_account_id', SALES_WA_ACCOUNT_ID)
    .eq('candidate_id', prospect.id)
    .single();
  const conversationId = (conv as { id: string }).id;

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
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    },
    senderType: 'system',
    templateId: template.id,
  });

  await logActivity(svc, {
    agency_id: SALES_AGENCY_ID,
    candidate_id: prospect.id,
    action: `Follow-up ${step + 1}/${FOLLOWUP_SEQUENCE.length} gesendet (${template.name})`,
    action_type: 'other',
    metadata: { kind: 'sales_followup_sent', close_opportunity_id: opp.id, step, preset_key: FOLLOWUP_SEQUENCE[step] },
  });

  const hasMore = FOLLOWUP_SEQUENCE.some((key, i) => i > step && byKey.has(key));
  const nextRun = hasMore ? nextFollowupRun(now, opp.rhythm!) : null;
  if (nextRun) {
    await svc.from('scheduled_jobs').insert({
      agency_id: SALES_AGENCY_ID,
      type: 'sales.followup',
      run_at: nextRun.toISOString(),
      payload: { ...payload, rhythm: opp.rhythm! } satisfies FollowupJobPayload,
      status: 'pending',
    });
  }

  await notifySales(svc, {
    emoji: '🔁',
    title: `Follow-up ${step + 1}/${FOLLOWUP_SEQUENCE.length} an ${prospect.name}`,
    body: `${template.name} gesendet.${nextRun ? ` Nächstes am ${formatDatum(nextRun)}.` : ' Das war das letzte.'}`,
    type: 'system',
    phone: prospect.phone_e164,
    conversationId,
  });
  return 'sent';
}

/**
 * Der Lead hat geantwortet → laufende Follow-ups pausieren.
 * Gibt true zurück, wenn eine Kette lief (dann Slack + Aufgabe in Close).
 */
export async function pauseFollowupsOnReply(
  svc: SupabaseClient,
  prospect: { id: string; name: string; phone: string; email?: string | null },
  text: string,
  conversationId: string,
  today: string,
): Promise<boolean> {
  const pending = await pendingFollowupJobs(svc, { prospectId: prospect.id });
  if (!pending.length) return false;
  await cancelJobs(svc, pending.map((j) => j.id));

  let inClose = false;
  try {
    inClose = !!(await addCloseTask(
      { email: prospect.email, phone: prospect.phone },
      `Auf WhatsApp-Antwort reagieren: ${prospect.name} hat auf ein Follow-up geantwortet ("${text.slice(0, 120)}")`,
      today,
    ));
    await addCloseNoteByEmail(prospect.email ?? null, 'WhatsApp-Follow-ups pausiert: Lead hat geantwortet.', prospect.phone);
  } catch (err) {
    console.error('[sales] Close bei Follow-up-Pause fehlgeschlagen:', err);
  }

  await notifySales(svc, {
    emoji: '💬',
    title: `Antwort auf Follow-up: ${prospect.name}`,
    body: `"${text.slice(0, 300)}"\nFollow-ups sind pausiert${inClose ? ', Aufgabe in Close angelegt' : ''}. Zum Fortsetzen in Close den Follow-up-Rhythmus neu auswählen.`,
    type: 'whatsapp_inbound',
    phone: prospect.phone,
    conversationId,
  });
  return true;
}
