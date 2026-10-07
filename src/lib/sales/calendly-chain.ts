/**
 * Sales-Kette (Zoepp Media intern): Calendly-Buchung → WhatsApp-Reminder-Jobs.
 *
 * Wird nur aktiv wenn SALES_REMINDERS_ENABLED === 'true' und die Buchung
 * einen der beiden Sales-Event-Types trifft (Setting 15min / Beratung 60min).
 *
 * Kette pro Buchung (dedupe über calendly_event_id):
 *   sales.booking      — sofort (Buchungs-Template)
 *   sales.confirmation — start−24h, Fallback start−3h, sonst skip
 *   sales.reminder     — setting: start−15min | beratung: start−1h
 *   sales.noshow_check — end_time+30min (Notification, kein Auto-Versand)
 *
 * Storno (invitee.canceled) cancelt alle pending Jobs der Buchung.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { notifySales } from './notify';

export type SalesChain = 'setting' | 'beratung';

export const SALES_AGENCY_ID = '2e4140ec-efc5-46db-9746-0ce3c32dc558';
export const SALES_WA_ACCOUNT_ID = 'cbec5ce7-e282-4de1-a10f-01085fe3d120';

/** Calendly Event-Type-UUIDs → Kette */
export const SALES_EVENT_TYPES: Record<string, SalesChain> = {
  // "Analysegespräch mit Zoepp Media" (15 min)
  'da8d1726-8fa6-467e-88d0-51f1cf0fd67c': 'setting',
  // "60min Beratungsgespräch mit Felix Zoepp"
  'bd63a241-57da-425c-a4c0-f4d43a1010f4': 'beratung',
};

export function salesRemindersEnabled(): boolean {
  return process.env.SALES_REMINDERS_ENABLED === 'true';
}

/** Telefonnummer aus Calendly-Antworten in E.164 normalisieren (DE-Default). */
export function normalizeToE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  let digits: string;
  if (cleaned.startsWith('+')) digits = cleaned.slice(1);
  else if (cleaned.startsWith('00')) digits = cleaned.slice(2);
  else if (cleaned.startsWith('0')) digits = `49${cleaned.slice(1)}`;
  else digits = cleaned;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

const PHONE_QUESTION_KEYWORDS = ['telefon', 'phone', 'handy', 'mobil', 'whatsapp', 'nummer'];

/**
 * Telefonnummer aus einer Calendly-Buchung ermitteln. Reihenfolge:
 * 1. SMS-Reminder-Nummer (text_reminder_number)
 * 2. Ort bei "Ich rufe an" (location.type === 'outbound_call' → location.location ist die Nummer des Gasts)
 * 3. Antwort auf eine Frage nach Telefon/Handy/WhatsApp
 */
export function extractInviteePhone(
  invitee: {
    text_reminder_number?: string | null;
    questions_and_answers?: { question: string; answer: string }[];
  },
  location: { type?: string; location?: string } | null | undefined,
): string | null {
  if (invitee.text_reminder_number) return invitee.text_reminder_number;
  if (location?.type === 'outbound_call' && location.location) return location.location;
  const answer = invitee.questions_and_answers?.find((qa) => {
    const q = qa.question.toLowerCase();
    return PHONE_QUESTION_KEYWORDS.some((k) => q.includes(k));
  });
  return answer?.answer || null;
}

/** Firmenname aus den Calendly-Antworten (Frage enthält "Unternehmen" oder "Firma"). */
export function extractCompany(invitee: { questions_and_answers?: { question: string; answer: string }[] }): string | null {
  const qa = invitee.questions_and_answers?.find((x) => /unternehmen|firma/i.test(x.question));
  return qa?.answer?.trim() || null;
}

/** "Fr. 05.10., 18:00 Uhr" in Berliner Zeit */
export function formatTermin(iso: string): string {
  const d = new Date(iso);
  const tag = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });
  const zeit = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  return `${tag}, ${zeit} Uhr`;
}

/** Bestätigungszeitpunkt: start−24h, Fallback start−3h, sonst null (skip). */
export function computeConfirmationTime(start: Date, now: Date): Date | null {
  const dayBefore = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  if (dayBefore.getTime() > now.getTime() + 30 * 60 * 1000) return dayBefore;
  const threeHours = new Date(start.getTime() - 3 * 60 * 60 * 1000);
  if (threeHours.getTime() > now.getTime() + 30 * 60 * 1000) return threeHours;
  return null;
}

/** Reminder-Zeitpunkt: setting start−15min, beratung start−1h; null wenn in der Vergangenheit. */
export function computeReminderTime(chain: SalesChain, start: Date, now: Date): Date | null {
  const offsetMs = chain === 'setting' ? 15 * 60 * 1000 : 60 * 60 * 1000;
  const runAt = new Date(start.getTime() - offsetMs);
  return runAt.getTime() > now.getTime() ? runAt : null;
}

export interface SalesCalendlyEvent {
  chain: SalesChain;
  calendlyEventId: string;
  eventTypeName: string | null;
  eventName: string | null;
  startTime: string; // ISO
  endTime: string | null; // ISO
  location: string | null;
  inviteeName: string;
  inviteeEmail: string | null;
  phone: string | null;
  /** Antwort auf die Calendly-Frage "Unternehmensname" (falls vorhanden) */
  company?: string | null;
}

export interface SalesBookingResult {
  /** Prospect-ID oder null, wenn die Buchung keine verwertbare Nummer hat */
  prospectId: string | null;
  jobsScheduled: boolean;
}

/** Prospect zur Nummer finden oder anlegen (unique: agency_id + phone_e164). */
export async function ensureSalesProspect(
  svc: SupabaseClient,
  phoneE164: string,
  name: string,
  email: string | null,
): Promise<string | null> {
  const { data: existing } = await svc
    .from('candidates')
    .select('id')
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('phone_e164', phoneE164)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const id = (existing as { id: string }).id;
    // Buchung mit Nummer = Kontaktbasis — Opt-in sicherstellen
    await svc.from('candidates').update({ whatsapp_opt_in: true }).eq('id', id).eq('agency_id', SALES_AGENCY_ID);
    return id;
  }

  // candidates.current_stage_id ist Pflicht — erste Stage als Platzhalter
  const { data: stage } = await svc
    .from('pipeline_stages')
    .select('id')
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!stage) return null;

  const { data: created, error } = await svc
    .from('candidates')
    .insert({
      agency_id: SALES_AGENCY_ID,
      name: name || 'Unbekannt',
      email,
      phone: phoneE164,
      phone_e164: phoneE164,
      source: 'manual',
      current_stage_id: (stage as { id: string }).id,
      whatsapp_opt_in: true,
    })
    .select('id')
    .single();
  if (error || !created) return null;
  return (created as { id: string }).id;
}

/** Reminder-Jobs der Kette planen (dedupe über calendly_event_id — Doppel-Webhooks sind idempotent). */
async function scheduleSalesJobs(svc: SupabaseClient, input: SalesCalendlyEvent, now: Date): Promise<void> {
  const start = new Date(input.startTime);
  const end = input.endTime ? new Date(input.endTime) : start;
  const payload = { calendly_event_id: input.calendlyEventId, chain: input.chain };

  const jobs: Array<{ type: string; run_at: Date; dedupe: string }> = [
    { type: 'sales.booking', run_at: now, dedupe: `sales.booking:${input.calendlyEventId}` },
  ];

  const confirmAt = computeConfirmationTime(start, now);
  if (confirmAt) {
    jobs.push({ type: 'sales.confirmation', run_at: confirmAt, dedupe: `sales.confirmation:${input.calendlyEventId}` });
  }

  const reminderAt = computeReminderTime(input.chain, start, now);
  if (reminderAt) {
    jobs.push({ type: 'sales.reminder', run_at: reminderAt, dedupe: `sales.reminder:${input.calendlyEventId}` });
  }

  // Nicht bestätigt? 2h vor dem Termin prüfen → "Lead anrufen" (nur wenn eine Bestätigung angefragt wird)
  const unconfirmedAt = new Date(start.getTime() - 2 * 60 * 60 * 1000);
  if (confirmAt && unconfirmedAt.getTime() > confirmAt.getTime()) {
    jobs.push({
      type: 'sales.unconfirmed_check',
      run_at: unconfirmedAt,
      dedupe: `sales.unconfirmed_check:${input.calendlyEventId}`,
    });
  }

  jobs.push({
    type: 'sales.noshow_check',
    run_at: new Date(end.getTime() + 30 * 60 * 1000),
    dedupe: `sales.noshow_check:${input.calendlyEventId}`,
  });

  // Einzeln inserten: der Dedupe-Index ist partiell (WHERE dedupe_key IS NOT NULL),
  // ON CONFLICT (dedupe_key) via PostgREST greift dort nicht — 23505 gilt als "schon geplant".
  for (const j of jobs) {
    const { error } = await svc.from('scheduled_jobs').insert({
      agency_id: SALES_AGENCY_ID,
      type: j.type,
      run_at: j.run_at.toISOString(),
      payload,
      status: 'pending',
      dedupe_key: j.dedupe,
    });
    if (error && error.code !== '23505') {
      throw new Error(`Sales-Job ${j.type} konnte nicht geplant werden: ${error.message}`);
    }
  }
}

/**
 * Neue Sales-Buchung aus Calendly — eigener Pfad, unabhängig vom Recruiting:
 * 1. Prospect anlegen (nur mit verwertbarer Nummer)
 * 2. Buchung in calendly_events speichern (vor den Jobs, damit sales.booking sie findet)
 * 3. Reminder-Jobs planen (nur wenn SALES_REMINDERS_ENABLED)
 * Ohne Nummer: Buchung trotzdem speichern und das interne Team benachrichtigen.
 */
export async function handleSalesBooking(
  svc: SupabaseClient,
  input: SalesCalendlyEvent,
  now: Date = new Date(),
): Promise<SalesBookingResult> {
  const phoneE164 = normalizeToE164(input.phone);
  const prospectId = phoneE164
    ? await ensureSalesProspect(svc, phoneE164, input.inviteeName, input.inviteeEmail)
    : null;

  const { error } = await svc.from('calendly_events').upsert(
    {
      agency_id: SALES_AGENCY_ID,
      candidate_id: prospectId,
      calendly_event_id: input.calendlyEventId,
      event_type: input.eventTypeName,
      event_name: input.eventName,
      start_time: input.startTime,
      end_time: input.endTime,
      invitee_name: input.inviteeName,
      invitee_email: input.inviteeEmail,
      invitee_phone: phoneE164 ?? input.phone,
      status: 'scheduled',
      location: input.location,
    },
    { onConflict: 'calendly_event_id' },
  );
  if (error) throw new Error(`Sales-Buchung konnte nicht gespeichert werden: ${error.message}`);

  if (!prospectId) {
    await notifySales(svc, {
      emoji: '⚠️',
      title: `Buchung ohne Handynummer: ${input.inviteeName}`,
      body: `${input.eventTypeName ?? 'Termin'} am ${formatTermin(input.startTime)}${input.company ? ` · ${input.company}` : ''} — keine WhatsApp-Erinnerungen möglich.${input.inviteeEmail ? ` E-Mail: ${input.inviteeEmail}` : ''}`,
      type: 'system',
    });
    return { prospectId: null, jobsScheduled: false };
  }

  // Konversation sicherstellen — ohne sie bricht der Versand in sales-reminders ab.
  // state 'human_active': der Sales-Bot führt keinen Bot-Dialog.
  await svc.from('conversations').upsert(
    { agency_id: SALES_AGENCY_ID, candidate_id: prospectId, wa_account_id: SALES_WA_ACCOUNT_ID, state: 'human_active' },
    { onConflict: 'wa_account_id,candidate_id', ignoreDuplicates: true },
  );

  // Eintragung (neuer Lead) dieser Buchung zuordnen → Direktbuchung oder später gebucht
  try {
    const { markiereBuchung } = await import('./eintragungen');
    await markiereBuchung(svc, { email: input.inviteeEmail, phone: phoneE164 ?? input.phone, gebuchtAm: now });
  } catch (err) {
    console.error('[sales] Eintragung nicht zugeordnet:', err);
  }

  if (!salesRemindersEnabled()) return { prospectId, jobsScheduled: false };

  await scheduleSalesJobs(svc, input, now);

  // Gebucht → laufende WhatsApp-Follow-ups dieses Leads stoppen
  const { data: stoppedFollowups } = await svc
    .from('scheduled_jobs')
    .update({ status: 'cancelled', updated_at: now.toISOString() })
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('type', 'sales.followup')
    .eq('status', 'pending')
    .eq('payload->>prospect_id', prospectId)
    .select('id');
  const followupsStopped = ((stoppedFollowups ?? []) as unknown[]).length > 0;

  const { data: conv } = await svc
    .from('conversations')
    .select('id')
    .eq('wa_account_id', SALES_WA_ACCOUNT_ID)
    .eq('candidate_id', prospectId)
    .maybeSingle();
  await notifySales(svc, {
    emoji: '📅',
    title: `Neue Buchung: ${input.inviteeName}`,
    body: `${input.chain === 'beratung' ? 'Beratungsgespräch' : 'Analysegespräch'} am ${formatTermin(input.startTime)}${input.company ? ` · ${input.company}` : ''}${followupsStopped ? '\nWhatsApp-Follow-ups für diesen Lead sind gestoppt.' : ''}`,
    type: 'new_candidate',
    phone: phoneE164,
    conversationId: (conv as { id: string } | null)?.id ?? null,
  });

  return { prospectId, jobsScheduled: true };
}

/** Storno einer Sales-Buchung: Status setzen und alle offenen Jobs canceln. */
export async function handleSalesCancellation(
  svc: SupabaseClient,
  calendlyEventId: string,
  info?: { inviteeName: string; startTime: string | null; rescheduled?: boolean },
): Promise<void> {
  await svc
    .from('calendly_events')
    .update({ status: 'cancelled' })
    .eq('calendly_event_id', calendlyEventId)
    .eq('agency_id', SALES_AGENCY_ID);
  await cancelSalesJobs(svc, calendlyEventId);

  // Verschiebung = Storno + neue Buchung → nur die neue Buchung melden
  if (info && !info.rescheduled) {
    await notifySales(svc, {
      emoji: '❌',
      title: `Storniert: ${info.inviteeName}`,
      body: info.startTime ? `Termin am ${formatTermin(info.startTime)} wurde in Calendly abgesagt.` : 'Termin wurde in Calendly abgesagt.',
      type: 'system',
    });
  }
}

/** Storno: alle noch offenen Jobs dieser Buchung canceln. */
export async function cancelSalesJobs(svc: SupabaseClient, calendlyEventId: string): Promise<void> {
  await svc
    .from('scheduled_jobs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('status', 'pending')
    .like('dedupe_key', `sales.%:${calendlyEventId}`);
}
