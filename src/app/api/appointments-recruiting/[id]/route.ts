import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { cancelAppointment, createProposedAppointment } from '@/lib/appointments/lifecycle';
import { fireEvent } from '@/lib/automations/fire';
import { logActivity } from '@/lib/activity/log';

const VALID_STATUSES = new Set(['done', 'no_show', 'cancelled']);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const { id: appointmentId } = await params;

  let body: { status: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ error: 'Ungültiger Status — erlaubt: done, no_show, cancelled' }, { status: 400 });
  }

  const svc = createAdminClient();

  // Termin laden + Agency-Guard
  const { data: appt } = await svc
    .from('appointments')
    .select('id, agency_id, application_id, type, location, booking_token')
    .eq('id', appointmentId)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!appt) return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 });

  const { data: application } = await svc
    .from('applications')
    .select('candidate_id')
    .eq('id', appt.application_id)
    .eq('agency_id', agencyId)
    .single();

  switch (body.status) {
    case 'done': {
      await svc
        .from('appointments')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', appointmentId)
        .eq('agency_id', agencyId);

      await logActivity(svc, {
        agency_id: agencyId,
        candidate_id: application?.candidate_id ?? null,
        action: 'Termin als stattgefunden markiert',
        action_type: 'appointment_done',
      });
      break;
    }

    case 'no_show': {
      await svc
        .from('appointments')
        .update({ status: 'no_show', updated_at: new Date().toISOString() })
        .eq('id', appointmentId)
        .eq('agency_id', agencyId);

      // Neuen Buchungslink für No-Show-Followup erstellen
      const { appointmentId: newApptId, bookingToken: newToken } = await createProposedAppointment(svc, {
        agencyId,
        applicationId: appt.application_id,
        type: appt.type as 'call' | 'video' | 'onsite',
        location: appt.location ?? null,
      });

      // no_show_followup +1h planen mit neuem Token
      await svc.from('scheduled_jobs').upsert(
        {
          agency_id: agencyId,
          run_at: new Date(Date.now() + 60 * 60_000).toISOString(),
          type: 'appointment.no_show_followup',
          payload: { appointment_id: newApptId, booking_token: newToken },
          status: 'pending',
          dedupe_key: `appt.no_show_followup:${appointmentId}`,
        },
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      );

      await fireEvent('appointment.no_show', agencyId, {
        candidate_id: application?.candidate_id,
        extra: { appointment_id: appointmentId },
      });

      await logActivity(svc, {
        agency_id: agencyId,
        candidate_id: application?.candidate_id ?? null,
        action: 'Termin als No-Show markiert',
        action_type: 'appointment_no_show',
      });
      break;
    }

    case 'cancelled': {
      await cancelAppointment(svc, { agencyId, appointmentId });
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
