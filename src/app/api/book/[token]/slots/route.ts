import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSlots } from '@/lib/appointments/slots';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const svc = createAdminClient();

  // Token-Lookup
  const { data: appt } = await svc.from('appointments')
    .select('id, agency_id, application_id, status, token_expires_at, type, location')
    .eq('booking_token', token)
    .maybeSingle();

  if (!appt) {
    return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 });
  }
  if (appt.token_expires_at && new Date(appt.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Buchungslink abgelaufen' }, { status: 410 });
  }

  // Job + Verfügbarkeiten laden
  const { data: application } = await svc.from('applications')
    .select('job_id').eq('id', appt.application_id).eq('agency_id', appt.agency_id).single();
  if (!application) {
    return NextResponse.json({ error: 'Bewerbung nicht gefunden' }, { status: 404 });
  }

  const { data: job } = await svc.from('jobs')
    .select('id, appointment_duration_minutes, appointment_buffer_minutes')
    .eq('id', application.job_id).eq('agency_id', appt.agency_id).single();
  if (!job) {
    return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 });
  }

  const { data: rules } = await svc.from('availability_rules')
    .select('weekday, start_time, end_time')
    .eq('job_id', job.id).eq('agency_id', appt.agency_id);

  const { data: agency } = await svc.from('agencies')
    .select('timezone').eq('id', appt.agency_id).single();

  // Bereits gebuchte Termine für diese Agentur laden
  const { data: booked } = await svc.from('appointments')
    .select('starts_at, ends_at')
    .eq('agency_id', appt.agency_id)
    .in('status', ['booked', 'confirmed'])
    .not('starts_at', 'is', null);

  const slots = computeSlots({
    rules: rules ?? [],
    bookedSlots: (booked ?? []).filter((b: { starts_at: string | null; ends_at: string | null }) => b.starts_at && b.ends_at).map((b: { starts_at: string; ends_at: string }) => ({
      starts_at: b.starts_at, ends_at: b.ends_at,
    })),
    from: new Date(),
    days: 14,
    durationMinutes: job.appointment_duration_minutes ?? 30,
    bufferMinutes: job.appointment_buffer_minutes ?? 15,
    timezone: agency?.timezone ?? 'Europe/Berlin',
  });

  return NextResponse.json({
    slots: slots.map((s: { start: Date; end: Date }) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
    appointment: {
      id: appt.id,
      status: appt.status,
      type: appt.type,
      location: appt.location,
    },
  });
}
