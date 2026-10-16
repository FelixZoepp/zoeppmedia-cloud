import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bookAppointment, cancelAppointment, rescheduleAppointment } from '@/lib/appointments/lifecycle';
import { ladeFreieSlots } from '@/lib/appointments/freie-slots';
import { ladeBuchungsModus } from '@/lib/appointments/vorstellungsrunden';
import { vollstaendigeAdresse } from '@/lib/appointments/termin-format';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const svc = createAdminClient();

  // Token-Lookup
  const { data: appt } = await svc.from('appointments')
    .select('id, agency_id, application_id, status, token_expires_at, location')
    .eq('booking_token', token)
    .maybeSingle();

  if (!appt) {
    return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 });
  }
  if (appt.token_expires_at && new Date(appt.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Buchungslink abgelaufen' }, { status: 410 });
  }

  let body: { action: string; start?: string; runde_id?: string };
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
  // Vorstellungsrunde: nur angebotene Runden mit freiem Platz; Ort = vollständige Adresse (+ Hinweis)
  let runde: { id: string; start: Date; end: Date; ort: string } | null = null;
  let ort: string | null | undefined;
  const modus = needsStart ? await ladeBuchungsModus(svc, appt) : null;
  if (modus?.modus === 'vorstellungsrunde') {
    const r = modus.runden.find((x) => x.id === body.runde_id);
    if (!body.runde_id || !r) {
      return NextResponse.json({ error: 'Diese Vorstellungsrunde ist nicht mehr verfügbar' }, { status: 409 });
    }
    runde = { id: r.id, start: new Date(r.starts_at), end: new Date(r.ends_at), ort: vollstaendigeAdresse(r.adresse, r.hinweis) };
  } else if (needsStart) {
    // Einzelgespräch vor Ort/Video: Adresse bzw. Link der Stelle, falls der Termin noch keinen hat
    if (!appt.location && modus?.modus === 'einzel' && modus.ort && modus.format !== 'telefon') ort = modus.ort;
  }
  if (needsStart && !runde) {
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
        const startsAt = runde?.start ?? new Date(body.start!);
        const endsAt = runde?.end ?? new Date(startsAt.getTime() + durationMs);
        await bookAppointment(svc, {
          agencyId: appt.agency_id, appointmentId: appt.id,
          startsAt, endsAt, bookedVia: 'booking_page',
          ...(runde ? { vorstellungsrundeId: runde.id, location: runde.ort } : ort ? { location: ort } : {}),
        });
        break;
      }
      case 'reschedule': {
        const startsAt = runde?.start ?? new Date(body.start!);
        const endsAt = runde?.end ?? new Date(startsAt.getTime() + durationMs);
        await rescheduleAppointment(svc, {
          agencyId: appt.agency_id, oldAppointmentId: appt.id,
          startsAt, endsAt, bookedVia: 'booking_page',
          ...(runde ? { vorstellungsrundeId: runde.id, location: runde.ort } : ort ? { location: ort } : {}),
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
    if (msg.includes('ausgebucht')) {
      return NextResponse.json({ error: 'Diese Vorstellungsrunde ist leider gerade voll geworden' }, { status: 409 });
    }
    if (msg.includes('Slot bereits vergeben') || msg.includes('duplicate') || msg.includes('unique')) {
      return NextResponse.json({ error: 'Slot bereits vergeben' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
