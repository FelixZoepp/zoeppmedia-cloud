import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bookAppointment, cancelAppointment, rescheduleAppointment } from '@/lib/appointments/lifecycle';
import { ladeFreieSlots } from '@/lib/appointments/freie-slots';

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

  // Statusübergänge: buchen nur aus "vorgeschlagen", verschieben nur aus "gebucht"
  if (body.action === 'book' && appt.status !== 'proposed') {
    return NextResponse.json({ error: 'Termin ist bereits gebucht oder nicht mehr buchbar' }, { status: 409 });
  }
  if (body.action === 'reschedule' && appt.status !== 'booked' && appt.status !== 'confirmed') {
    return NextResponse.json({ error: 'Termin kann nicht verschoben werden' }, { status: 409 });
  }

  // Fix 3: body.start vor Verwendung validieren – nur angebotene, zukünftige Slots
  const needsStart = body.action === 'book' || body.action === 'reschedule';
  let durationMs = 30 * 60_000;
  if (needsStart) {
    const startsAt = new Date(body.start ?? '');
    if (!body.start || Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Ungültiger Zeitpunkt' }, { status: 400 });
    }
    const ergebnis = await ladeFreieSlots(svc, appt);
    if ('fehler' in ergebnis) {
      return NextResponse.json({ error: ergebnis.fehler }, { status: ergebnis.status });
    }
    if (!ergebnis.slots.some((s) => s.start.getTime() === startsAt.getTime())) {
      return NextResponse.json({ error: 'Dieser Zeitpunkt ist nicht verfügbar' }, { status: 409 });
    }
    durationMs = ergebnis.durationMinutes * 60_000;
  }

  try {
    switch (body.action) {
      case 'book': {
        const startsAt = new Date(body.start!);
        const endsAt = new Date(startsAt.getTime() + durationMs);
        await bookAppointment(svc, {
          agencyId: appt.agency_id, appointmentId: appt.id,
          startsAt, endsAt, bookedVia: 'booking_page',
        });
        break;
      }
      case 'reschedule': {
        const startsAt = new Date(body.start!);
        const endsAt = new Date(startsAt.getTime() + durationMs);
        await rescheduleAppointment(svc, {
          agencyId: appt.agency_id, oldAppointmentId: appt.id,
          startsAt, endsAt, bookedVia: 'booking_page',
        });
        break;
      }
      case 'cancel':
        // Fix 4: Guard für bereits abgeschlossene/stornierte Termine
        if (appt.status === 'cancelled' || appt.status === 'done') {
          return NextResponse.json({ error: 'Termin kann nicht mehr storniert werden' }, { status: 409 });
        }
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
