import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bookAppointment, cancelAppointment, rescheduleAppointment } from '@/lib/appointments/lifecycle';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const svc = createAdminClient();

  // Token-Lookup
  const { data: appt } = await svc.from('appointments')
    .select('id, agency_id, application_id, status, token_expires_at')
    .eq('booking_token', token)
    .maybeSingle();

  if (!appt) {
    return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 });
  }
  if (appt.token_expires_at && new Date(appt.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Buchungslink abgelaufen' }, { status: 410 });
  }

  let body: { action: string; start?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  if (!body.action) {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  // Job laden für Dauer
  const { data: application } = await svc.from('applications')
    .select('job_id').eq('id', appt.application_id).eq('agency_id', appt.agency_id).single();
  const { data: job } = await svc.from('jobs')
    .select('appointment_duration_minutes').eq('id', application?.job_id).single();
  const durationMs = (job?.appointment_duration_minutes ?? 30) * 60_000;

  try {
    switch (body.action) {
      case 'book': {
        if (!body.start) return NextResponse.json({ error: 'Startzeit fehlt' }, { status: 400 });
        const startsAt = new Date(body.start);
        const endsAt = new Date(startsAt.getTime() + durationMs);
        await bookAppointment(svc, {
          agencyId: appt.agency_id, appointmentId: appt.id,
          startsAt, endsAt, bookedVia: 'booking_page',
        });
        break;
      }
      case 'reschedule': {
        if (!body.start) return NextResponse.json({ error: 'Startzeit fehlt' }, { status: 400 });
        const startsAt = new Date(body.start);
        const endsAt = new Date(startsAt.getTime() + durationMs);
        await rescheduleAppointment(svc, {
          agencyId: appt.agency_id, oldAppointmentId: appt.id,
          startsAt, endsAt, bookedVia: 'booking_page',
        });
        break;
      }
      case 'cancel':
        await cancelAppointment(svc, { agencyId: appt.agency_id, appointmentId: appt.id });
        break;
      default:
        return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    if (msg.includes('Slot bereits vergeben') || msg.includes('duplicate') || msg.includes('unique')) {
      return NextResponse.json({ error: 'Slot bereits vergeben' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
