import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/activity/log';
import { fireEvent } from '@/lib/automations/fire';
import { sendAppointmentUpdateEmail, sendAgencyCalendarInvite } from '@/lib/email/resend';
import { buildAppointmentInvite, APPOINTMENT_TYPE_LABELS } from '@/lib/calendar/invite';

const STATUSES = ['geplant', 'erschienen', 'no_show', 'abgesagt'];

/** No-Show am Termin → 1 Punkt im bestehenden No-Show-System, Blacklist ab 3 Punkten */
async function recordNoShowPoints(
  supabase: SupabaseClient,
  userId: string,
  candidateId: string,
  agencyId: string,
  appointmentType: string
) {
  await supabase.from('noshow_events').insert({
    agency_id: agencyId,
    candidate_id: candidateId,
    event_type: 'no_show',
    points: 1.0,
    appointment_type: appointmentType,
    reason: null,
    created_by: userId,
  });

  const { data: allEvents } = await supabase
    .from('noshow_events')
    .select('points')
    .eq('candidate_id', candidateId);
  const totalPoints = (allEvents ?? []).reduce((sum, e) => sum + Number(e.points), 0);

  const updateData: Record<string, unknown> = { noshow_points: totalPoints };
  if (totalPoints >= 3) {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 12);
    updateData.blacklisted = true;
    updateData.blacklisted_at = new Date().toISOString();
    updateData.blacklisted_by = userId;
    updateData.blacklist_reason = `Automatisch gesperrt: ${totalPoints} No-Show Punkte`;
    updateData.blacklist_expires_at = expiresAt.toISOString();
  }
  await supabase.from('candidates').update(updateData).eq('id', candidateId);

  fireEvent('noshow_recorded', agencyId, { candidate_id: candidateId }).catch(() => {});

  return totalPoints;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  const { data: appointment } = await supabase
    .from('candidate_appointments')
    .select('id, candidate_id, agency_id, type, scheduled_at, notes, ics_sequence')
    .eq('id', id)
    .single();

  if (!appointment) return NextResponse.json({ error: 'Termin nicht gefunden.' }, { status: 404 });

  const update: Record<string, string | number | null> = {};

  if (body.reminder_done) {
    update.reminder_done_at = new Date().toISOString();
    update.reminder_by = user.id;
  }
  if (body.status) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Ungültiger Status.' }, { status: 400 });
    }
    update.status = body.status;
  }
  if (body.scheduled_at) {
    if (isNaN(Date.parse(body.scheduled_at))) {
      return NextResponse.json({ error: 'Ungültiges Datum.' }, { status: 400 });
    }
    update.scheduled_at = body.scheduled_at;
  }
  if (body.notes !== undefined) {
    update.notes = body.notes || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen übergeben.' }, { status: 400 });
  }

  // Verschiebung/Absage → Kalender-Update braucht höhere ICS-Sequence
  const rescheduled = !!body.scheduled_at;
  const cancelled = body.status === 'abgesagt';
  if (rescheduled || cancelled) {
    update.ics_sequence = (Number(appointment.ics_sequence) || 0) + 1;
  }

  const { data, error } = await supabase
    .from('candidate_appointments')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const typeLabel = appointment.type === 'probetag' ? 'Probetag' : 'Vorstellungsgespräch';
  if (body.reminder_done) {
    await logActivity(supabase, {
      agency_id: appointment.agency_id,
      user_id: user.id,
      candidate_id: appointment.candidate_id,
      action: `Erinnerungsanruf für ${typeLabel} erledigt`,
      action_type: 'call',
      metadata: { appointment_id: id, type: appointment.type },
    });
  } else if (body.status) {
    const STATUS_LABELS: Record<string, string> = {
      geplant: 'Geplant',
      erschienen: 'Erschienen',
      no_show: 'No-Show',
      abgesagt: 'Abgesagt',
    };
    await logActivity(supabase, {
      agency_id: appointment.agency_id,
      user_id: user.id,
      candidate_id: appointment.candidate_id,
      action: `${typeLabel}: ${STATUS_LABELS[body.status] ?? body.status}`,
      action_type: 'other',
      metadata: { appointment_id: id, status: body.status },
    });
  } else if (body.scheduled_at) {
    await logActivity(supabase, {
      agency_id: appointment.agency_id,
      user_id: user.id,
      candidate_id: appointment.candidate_id,
      action: `${typeLabel} verschoben auf ${new Date(body.scheduled_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
      action_type: 'other',
      metadata: { appointment_id: id, scheduled_at: body.scheduled_at },
    });
  }

  // Verschiebung/Absage → Mail an Bewerber + Kalender-Update an den Kunden
  if (rescheduled || cancelled) {
    const kind = cancelled ? 'abgesagt' as const : 'verschoben' as const;
    const method = cancelled ? 'CANCEL' as const : 'REQUEST' as const;
    const scheduledAt = new Date((data.scheduled_at as string) ?? appointment.scheduled_at);
    const typeLabelInvite = APPOINTMENT_TYPE_LABELS[appointment.type] ?? appointment.type;

    const [{ data: candidate }, { data: agency }] = await Promise.all([
      supabase.from('candidates').select('name, email, phone').eq('id', appointment.candidate_id).single(),
      supabase.from('agencies').select('name, email').eq('id', appointment.agency_id).single(),
    ]);

    if (candidate) {
      const agencyName = agency?.name ?? 'Zoepp Media Cloud';
      const inviteBase = {
        appointmentId: appointment.id as string,
        type: appointment.type as string,
        scheduledAt,
        sequence: Number(update.ics_sequence),
        method,
        candidateName: candidate.name,
        candidatePhone: candidate.phone,
        notes: (data.notes as string | null) ?? appointment.notes,
        agencyName,
      };

      if (candidate.email) {
        sendAppointmentUpdateEmail(
          candidate.email,
          candidate.name,
          typeLabelInvite,
          scheduledAt,
          agencyName,
          inviteBase.notes,
          kind,
          buildAppointmentInvite({ ...inviteBase, attendeeEmail: candidate.email, attendeeName: candidate.name }),
        ).catch(() => {});
      }

      if (agency?.email) {
        const dateStr = scheduledAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' });
        const subject = cancelled
          ? `Termin abgesagt: ${typeLabelInvite} mit ${candidate.name}`
          : `Termin verschoben: ${typeLabelInvite} mit ${candidate.name} — jetzt ${dateStr}`;
        const bodyHtml = cancelled
          ? `<p>Der Termin <strong>${typeLabelInvite}</strong> mit <strong>${candidate.name}</strong> wurde abgesagt. Der Anhang entfernt den Termin aus deinem Kalender.</p>`
          : `<p>Der Termin <strong>${typeLabelInvite}</strong> mit <strong>${candidate.name}</strong> wurde verschoben auf <strong>${dateStr} Uhr</strong>. Der Anhang aktualisiert den Termin in deinem Kalender.</p>`;
        sendAgencyCalendarInvite(
          agency.email,
          subject,
          bodyHtml,
          buildAppointmentInvite({ ...inviteBase, attendeeEmail: agency.email, attendeeName: agencyName }),
          method,
        ).catch(() => {});
      }
    }
  }

  // No-Show → Punkte im bestehenden No-Show-System vergeben (Blacklist ab 3)
  let noshowPoints: number | null = null;
  if (body.status === 'no_show') {
    noshowPoints = await recordNoShowPoints(
      supabase,
      user.id,
      appointment.candidate_id,
      appointment.agency_id,
      appointment.type
    );
  }

  return NextResponse.json({ ...data, noshow_points: noshowPoints });
}
