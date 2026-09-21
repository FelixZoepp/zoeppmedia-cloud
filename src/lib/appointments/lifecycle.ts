import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppointmentType } from '@/lib/types/database';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { buildAppointmentInvite } from '@/lib/calendar/invite';
import { sendAgencyCalendarInvite } from '@/lib/email/resend';
import { logActivity } from '@/lib/activity/log';
import { fireEvent } from '@/lib/automations/fire';

export async function createProposedAppointment(svc: SupabaseClient, args: {
  agencyId: string; applicationId: string; type: AppointmentType; location: string | null;
}): Promise<{ appointmentId: string; bookingToken: string }> {
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await svc.from('appointments').insert({
    agency_id: args.agencyId,
    application_id: args.applicationId,
    type: args.type,
    location: args.location,
    status: 'proposed',
    token_expires_at: tokenExpiresAt,
  }).select('id, booking_token').single();

  if (error || !data) throw new Error('Termin konnte nicht erstellt werden');
  return { appointmentId: data.id, bookingToken: data.booking_token };
}

export async function bookAppointment(svc: SupabaseClient, args: {
  agencyId: string; appointmentId: string; startsAt: Date; endsAt: Date; bookedVia: string;
}): Promise<void> {
  // 1. Termin aktualisieren
  const { error: updateErr } = await svc.from('appointments').update({
    starts_at: args.startsAt.toISOString(),
    ends_at: args.endsAt.toISOString(),
    status: 'booked',
    booked_via: args.bookedVia,
    updated_at: new Date().toISOString(),
  }).eq('id', args.appointmentId).eq('agency_id', args.agencyId);

  if (updateErr) throw new Error('Termin konnte nicht gebucht werden');

  // 2. Termin + Application + Candidate + Agency laden
  const { data: appt } = await svc.from('appointments').select('*')
    .eq('id', args.appointmentId).eq('agency_id', args.agencyId).single();
  if (!appt) {
    console.error('[appointments] Buchung ohne Folgeaktionen — Datensatz fehlt', { appointmentId: args.appointmentId, table: 'appointments' });
    return;
  }

  const { data: application } = await svc.from('applications').select('id, candidate_id, assigned_to')
    .eq('id', appt.application_id).eq('agency_id', args.agencyId).single();
  if (!application) {
    console.error('[appointments] Buchung ohne Folgeaktionen — Datensatz fehlt', { appointmentId: args.appointmentId, table: 'applications', application_id: appt.application_id });
    return;
  }

  const { data: candidate } = await svc.from('candidates').select('id, name, phone_e164, email, whatsapp_opt_in')
    .eq('id', application.candidate_id).eq('agency_id', args.agencyId).single();
  if (!candidate) {
    console.error('[appointments] Buchung ohne Folgeaktionen — Datensatz fehlt', { appointmentId: args.appointmentId, table: 'candidates', candidate_id: application.candidate_id });
    return;
  }

  const { data: agency } = await svc.from('agencies').select('id, name, timezone')
    .eq('id', args.agencyId).single();

  // 3. Invite-Followup stornieren (falls vorhanden)
  await cancelAppointmentJobs(svc, { agencyId: args.agencyId, appointmentId: args.appointmentId });

  // 4. Reminder-Jobs planen
  const reminders = [
    { type: 'appointment.reminder_24h', runAt: new Date(args.startsAt.getTime() - 24 * 60 * 60_000), dedupe: `appt.reminder_24h:${args.appointmentId}` },
    { type: 'appointment.reminder_2h', runAt: new Date(args.startsAt.getTime() - 2 * 60 * 60_000), dedupe: `appt.reminder_2h:${args.appointmentId}` },
    { type: 'appointment.followup_check', runAt: new Date(args.endsAt.getTime() + 30 * 60_000), dedupe: `appt.followup_check:${args.appointmentId}` },
  ];

  for (const r of reminders) {
    await svc.from('scheduled_jobs').upsert({
      agency_id: args.agencyId,
      run_at: r.runAt.toISOString(),
      type: r.type,
      payload: { appointment_id: args.appointmentId },
      status: 'pending',
      dedupe_key: r.dedupe,
    }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  }

  // 5. WhatsApp-Bestätigungstemplate senden (best effort)
  const { data: conv } = await svc.from('conversations')
    .select('id, wa_account_id')
    .eq('candidate_id', candidate.id).eq('agency_id', args.agencyId).maybeSingle();

  if (conv && candidate.phone_e164) {
    const { data: tmpl } = await svc.from('whatsapp_templates')
      .select('id, name, body')
      .eq('wa_account_id', conv.wa_account_id)
      .eq('preset_key', 'appointment_confirmation')
      .eq('status', 'approved')
      .eq('agency_id', args.agencyId)
      .maybeSingle();

    if (tmpl) {
      const vorname = (candidate.name || '').split(' ')[0];
      const datum = args.startsAt.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', timeZone: agency?.timezone || 'Europe/Berlin' });
      const uhrzeit = args.startsAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: agency?.timezone || 'Europe/Berlin' });
      const ortOderLink = appt.location || 'wird noch mitgeteilt';

      await sendWhatsAppMessage(svc, {
        agencyId: args.agencyId,
        conversationId: conv.id,
        candidatePhone: candidate.phone_e164,
        waAccountId: conv.wa_account_id,
        payload: {
          to: candidate.phone_e164,
          type: 'template',
          template: {
            name: tmpl.name,
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
        templateId: tmpl.id,
      }).catch(() => {});
    }
  }

  // 6. ICS-Mail an Recruiter/assigned_to
  if (candidate.email || application.assigned_to) {
    // Recruiter-E-Mail aus assigned_to laden
    let recruiterEmail: string | null = null;
    let recruiterName: string | null = null;
    let isCandidateFallback = false;
    if (application.assigned_to) {
      const { data: recruiter } = await svc.from('users')
        .select('email, name').eq('id', application.assigned_to).eq('agency_id', args.agencyId).maybeSingle();
      recruiterEmail = recruiter?.email ?? null;
      recruiterName = recruiter?.name ?? null;
    }
    // Fallback: agency_owner
    if (!recruiterEmail) {
      const { data: owner } = await svc.from('users')
        .select('email, name').eq('agency_id', args.agencyId).eq('role', 'agency_owner').maybeSingle();
      recruiterEmail = owner?.email ?? null;
      recruiterName = owner?.name ?? null;
    }
    // Letzter Fallback: Bewerber-E-Mail (für Bestätigung an den Kandidaten)
    if (!recruiterEmail) {
      recruiterEmail = candidate.email ?? null;
      isCandidateFallback = true;
    }

    if (recruiterEmail) {
      const ics = buildAppointmentInvite({
        appointmentId: args.appointmentId,
        type: appt.type,
        scheduledAt: args.startsAt,
        sequence: appt.ics_sequence,
        method: 'REQUEST',
        candidateName: candidate.name || 'Bewerber',
        candidatePhone: candidate.phone_e164,
        notes: null,
        agencyName: agency?.name || 'Agentur',
        attendeeEmail: recruiterEmail,
        attendeeName: isCandidateFallback
          ? (candidate.name || 'Bewerber')
          : (recruiterName || 'Recruiter'),
      });
      await sendAgencyCalendarInvite(
        recruiterEmail,
        `Termin: ${candidate.name || 'Bewerber'}`,
        `<p>Neuer Termin mit ${candidate.name || 'Bewerber'} am ${args.startsAt.toLocaleDateString('de-DE', { timeZone: agency?.timezone || 'Europe/Berlin' })}</p>`,
        ics,
        'REQUEST',
      ).catch(() => {});
    }
  }

  // 7. Stage-Move auf interview
  const { data: interviewStage } = await svc.from('pipeline_stages')
    .select('id').eq('agency_id', args.agencyId).eq('stage_type', 'interview').maybeSingle();
  if (interviewStage) {
    await svc.from('applications').update({
      stage_id: interviewStage.id, updated_at: new Date().toISOString(),
    }).eq('id', appt.application_id).eq('agency_id', args.agencyId);
  }

  // 8. Activity + fireEvent
  await logActivity(svc, {
    agency_id: args.agencyId,
    candidate_id: application.candidate_id,
    action: `Termin gebucht: ${args.startsAt.toLocaleDateString('de-DE')} ${args.startsAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`,
    action_type: 'appointment_booked',
  });
  await fireEvent('appointment.booked', args.agencyId, {
    candidate_id: application.candidate_id,
    extra: { appointment_id: args.appointmentId, starts_at: args.startsAt.toISOString() },
  });
}

export async function cancelAppointment(svc: SupabaseClient, args: {
  agencyId: string; appointmentId: string; reason?: string;
}): Promise<void> {
  await svc.from('appointments').update({
    status: 'cancelled', updated_at: new Date().toISOString(),
  }).eq('id', args.appointmentId).eq('agency_id', args.agencyId);

  await cancelAppointmentJobs(svc, { agencyId: args.agencyId, appointmentId: args.appointmentId });

  const { data: appt } = await svc.from('appointments')
    .select('application_id').eq('id', args.appointmentId).eq('agency_id', args.agencyId).single();
  if (appt) {
    const { data: app } = await svc.from('applications')
      .select('candidate_id').eq('id', appt.application_id).eq('agency_id', args.agencyId).single();
    if (app) {
      await logActivity(svc, {
        agency_id: args.agencyId, candidate_id: app.candidate_id,
        action: `Termin abgesagt${args.reason ? ': ' + args.reason : ''}`,
        action_type: 'appointment_cancelled',
      });
      await fireEvent('appointment.cancelled', args.agencyId, {
        candidate_id: app.candidate_id,
        extra: { appointment_id: args.appointmentId },
      });
    }
  }
}

export async function rescheduleAppointment(svc: SupabaseClient, args: {
  agencyId: string; oldAppointmentId: string; startsAt: Date; endsAt: Date; bookedVia: string;
}): Promise<{ newAppointmentId: string }> {
  // P4-R7: Alt auf cancelled, neuer Datensatz
  const { data: old } = await svc.from('appointments')
    .select('application_id, type, location')
    .eq('id', args.oldAppointmentId).eq('agency_id', args.agencyId).single();
  if (!old) throw new Error('Termin nicht gefunden');

  await cancelAppointment(svc, { agencyId: args.agencyId, appointmentId: args.oldAppointmentId, reason: 'Verschoben' });

  const { appointmentId } = await createProposedAppointment(svc, {
    agencyId: args.agencyId, applicationId: old.application_id, type: old.type, location: old.location,
  });

  await bookAppointment(svc, {
    agencyId: args.agencyId, appointmentId, startsAt: args.startsAt, endsAt: args.endsAt, bookedVia: args.bookedVia,
  });

  return { newAppointmentId: appointmentId };
}

export async function cancelAppointmentJobs(svc: SupabaseClient, args: {
  agencyId: string; appointmentId: string;
}): Promise<void> {
  await svc.from('scheduled_jobs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('agency_id', args.agencyId)
    .eq('status', 'pending')
    .filter('dedupe_key', 'like', `%${args.appointmentId}%`);
}
