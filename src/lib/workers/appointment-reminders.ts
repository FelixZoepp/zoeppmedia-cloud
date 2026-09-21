/**
 * Worker-Funktionen für Termin-Reminder (Phase 4, Task 4).
 * Spec P4-R6: Ruhezeiten-Verschiebung; P4-R7: Status-Recheck vor Versand.
 * reminder_2h: bypassQuietHours=true — wird immer gesendet.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { isQuietHours, nextAllowedTime } from '@/lib/whatsapp/window';
import { createNotificationForAgency } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';

const ACTIVE_STATUSES = ['booked', 'confirmed'];

// ---------------------------------------------------------------------------
// Hilfsfunktion: Termin laden + Status-Guard
// ---------------------------------------------------------------------------

async function loadActiveAppointment(
  svc: SupabaseClient,
  agencyId: string,
  appointmentId: string,
): Promise<{
  id: string;
  status: string;
  application_id: string;
  starts_at: string | null;
  location: string | null;
} | null> {
  const { data } = await svc
    .from('appointments')
    .select('id, status, application_id, starts_at, location')
    .eq('id', appointmentId)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!data) return null;
  if (!ACTIVE_STATUSES.includes(data.status)) return null;
  return data as {
    id: string;
    status: string;
    application_id: string;
    starts_at: string | null;
    location: string | null;
  };
}

// ---------------------------------------------------------------------------
// Hilfsfunktion: Agency-Timezone laden
// ---------------------------------------------------------------------------

async function getAgencyTimezone(svc: SupabaseClient, agencyId: string): Promise<string> {
  const { data } = await svc
    .from('agencies')
    .select('timezone')
    .eq('id', agencyId)
    .maybeSingle();
  return (data as { timezone?: string } | null)?.timezone || 'Europe/Berlin';
}

// ---------------------------------------------------------------------------
// Hilfsfunktion: Job-run_at verschieben (Ruhezeit-Shift)
// ---------------------------------------------------------------------------

async function rescheduleJobForQuietHours(
  svc: SupabaseClient,
  agencyId: string,
  appointmentId: string,
  dedupeKeyFragment: string,
): Promise<void> {
  const timezone = await getAgencyTimezone(svc, agencyId);
  const newRunAt = nextAllowedTime(new Date(), timezone);

  await svc
    .from('scheduled_jobs')
    .update({ run_at: newRunAt.toISOString(), status: 'pending', updated_at: new Date().toISOString() })
    .eq('agency_id', agencyId)
    .filter('dedupe_key', 'eq', `${dedupeKeyFragment}:${appointmentId}`);
}

// ---------------------------------------------------------------------------
// Hilfsfunktion: Template + Kandidaten laden und Nachricht senden
// ---------------------------------------------------------------------------

async function sendReminderTemplate(
  svc: SupabaseClient,
  agencyId: string,
  appt: { id: string; application_id: string; starts_at: string | null; location: string | null },
  presetKey: string,
  bypassQuietHours: boolean,
): Promise<boolean> {
  // Bewerbung laden
  const { data: application } = await svc
    .from('applications')
    .select('id, candidate_id')
    .eq('id', appt.application_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!application) return false;

  // Kandidat laden
  const { data: candidate } = await svc
    .from('candidates')
    .select('id, name, phone_e164, whatsapp_opt_in')
    .eq('id', (application as { id: string; candidate_id: string }).candidate_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!(candidate as { whatsapp_opt_in?: boolean } | null)?.whatsapp_opt_in) return false;
  if (!(candidate as { phone_e164?: string | null } | null)?.phone_e164) return false;

  const cand = candidate as { id: string; name: string; phone_e164: string; whatsapp_opt_in: boolean };

  // Agency-Timezone für Template-Variablen
  const { data: agency } = await svc
    .from('agencies')
    .select('timezone')
    .eq('id', agencyId)
    .maybeSingle();
  const timezone = (agency as { timezone?: string } | null)?.timezone || 'Europe/Berlin';

  // Conversation laden
  const { data: conv } = await svc
    .from('conversations')
    .select('id, wa_account_id')
    .eq('candidate_id', cand.id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!conv) return false;
  const convData = conv as { id: string; wa_account_id: string };

  // Template laden
  const { data: tmpl } = await svc
    .from('whatsapp_templates')
    .select('id, name, body')
    .eq('wa_account_id', convData.wa_account_id)
    .eq('preset_key', presetKey)
    .eq('status', 'approved')
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!tmpl) return false;
  const tmplData = tmpl as { id: string; name: string; body: string };

  // Template-Variablen aufbauen
  const vorname = (cand.name || '').split(' ')[0];
  const startsAt = appt.starts_at ? new Date(appt.starts_at) : new Date();
  const datum = startsAt.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', timeZone: timezone });
  const uhrzeit = startsAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: timezone });
  const ortOderLink = appt.location || 'wird noch mitgeteilt';

  await sendWhatsAppMessage(svc, {
    agencyId,
    conversationId: convData.id,
    candidatePhone: cand.phone_e164,
    waAccountId: convData.wa_account_id,
    payload: {
      to: cand.phone_e164,
      type: 'template',
      template: {
        name: tmplData.name,
        language: { code: 'de' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: vorname },
            { type: 'text', text: datum },
            { type: 'text', text: uhrzeit },
            { type: 'text', text: ortOderLink },
          ],
        }],
      },
    },
    senderType: 'system',
    templateId: tmplData.id,
    bypassQuietHours,
  });

  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: cand.id,
    action: `Termin-Reminder gesendet (${presetKey})`,
    action_type: 'appointment_reminder_sent',
    metadata: { appointment_id: appt.id, preset_key: presetKey },
  });

  return true;
}

// ---------------------------------------------------------------------------
// processInviteFollowup — Einladungs-Nachverfolgung (status=proposed)
// ---------------------------------------------------------------------------

export async function processInviteFollowup(
  svc: SupabaseClient,
  agencyId: string,
  payload: { appointment_id: string },
): Promise<void> {
  const { data: appt } = await svc
    .from('appointments')
    .select('id, status, application_id')
    .eq('id', payload.appointment_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!appt) return;

  // Nur handeln wenn noch im proposed-Status (nicht gebucht)
  const apptData = appt as { id: string; status: string; application_id: string };
  if (apptData.status !== 'proposed') return;

  await createNotificationForAgency(svc, agencyId, {
    title: 'Termin-Einladung noch nicht bestätigt',
    body: `Termin ${apptData.id} wurde noch nicht vom Bewerber gebucht.`,
    type: 'noshow',
    push_url: '/appointments',
  });
}

// ---------------------------------------------------------------------------
// processReminder24h — 24h-Erinnerung
// ---------------------------------------------------------------------------

export async function processReminder24h(
  svc: SupabaseClient,
  agencyId: string,
  payload: { appointment_id: string },
): Promise<void> {
  // P4-R7: Status-Recheck
  const appt = await loadActiveAppointment(svc, agencyId, payload.appointment_id);
  if (!appt) return;

  // P4-R6: Ruhezeit-Check — verschieben statt senden
  const timezone = await getAgencyTimezone(svc, agencyId);
  if (isQuietHours(timezone)) {
    await rescheduleJobForQuietHours(svc, agencyId, payload.appointment_id, 'appt.reminder_24h');
    return;
  }

  await sendReminderTemplate(svc, agencyId, appt, 'appointment_reminder_24h', false);
}

// ---------------------------------------------------------------------------
// processReminder2h — 2h-Erinnerung (bypassQuietHours)
// ---------------------------------------------------------------------------

export async function processReminder2h(
  svc: SupabaseClient,
  agencyId: string,
  payload: { appointment_id: string },
): Promise<void> {
  // P4-R7: Status-Recheck
  const appt = await loadActiveAppointment(svc, agencyId, payload.appointment_id);
  if (!appt) return;

  // P4-R6: reminder_2h wird IMMER gesendet (bypassQuietHours=true)
  await sendReminderTemplate(svc, agencyId, appt, 'appointment_reminder_2h', true);
}

// ---------------------------------------------------------------------------
// processFollowupCheck — Nach dem Termin prüfen ob er stattgefunden hat
// ---------------------------------------------------------------------------

export async function processFollowupCheck(
  svc: SupabaseClient,
  agencyId: string,
  payload: { appointment_id: string },
): Promise<void> {
  // P4-R7: Status-Recheck — wenn noch booked/confirmed, Recruiter benachrichtigen
  const appt = await loadActiveAppointment(svc, agencyId, payload.appointment_id);
  if (!appt) return;

  // Termin ist noch im aktiven Status nach Ende-Zeitpunkt -> Recruiter informieren
  await createNotificationForAgency(svc, agencyId, {
    title: 'Termin-Nachverfolgung erforderlich',
    body: `Termin ${appt.id} ist beendet — bitte Ergebnis in der App erfassen.`,
    type: 'noshow',
    push_url: '/appointments',
  });
}

// ---------------------------------------------------------------------------
// processNoShowFollowup — No-Show nachverfolgen
// ---------------------------------------------------------------------------

export async function processNoShowFollowup(
  svc: SupabaseClient,
  agencyId: string,
  payload: { appointment_id: string },
): Promise<void> {
  // Termin laden (ohne Status-Guard, da auch booked-Status ein No-Show sein kann)
  const { data: appt } = await svc
    .from('appointments')
    .select('id, status, application_id, starts_at')
    .eq('id', payload.appointment_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!appt) return;
  const apptData = appt as { id: string; status: string; application_id: string; starts_at: string | null };

  // Nur bei booked/confirmed (candidate hat nicht abgesagt)
  if (!ACTIVE_STATUSES.includes(apptData.status)) return;

  // Bewerbung laden für candidate_id
  const { data: application } = await svc
    .from('applications')
    .select('id, candidate_id')
    .eq('id', apptData.application_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  await createNotificationForAgency(svc, agencyId, {
    title: 'Möglicher No-Show',
    body: `Bewerber ist möglicherweise nicht zum Termin erschienen (Termin ${apptData.id}).`,
    type: 'noshow',
    push_url: '/appointments',
  });

  if (application) {
    const appData = application as { id: string; candidate_id: string };
    await logActivity(svc, {
      agency_id: agencyId,
      candidate_id: appData.candidate_id,
      action: 'Möglicher No-Show gemeldet',
      action_type: 'appointment_no_show',
      metadata: { appointment_id: apptData.id },
    });
  }
}
