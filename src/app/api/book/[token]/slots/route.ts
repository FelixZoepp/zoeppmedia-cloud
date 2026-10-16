import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeFreieSlots } from '@/lib/appointments/freie-slots';
import { ladeBuchungsModus } from '@/lib/appointments/vorstellungsrunden';
import { vollstaendigeAdresse } from '@/lib/appointments/termin-format';

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

  const appointment = { id: appt.id, status: appt.status, type: appt.type, location: appt.location };

  // Vorstellungsrunde: feste Gruppentermine mit freiem Platz statt Einzelslots
  const modus = await ladeBuchungsModus(svc, appt);
  if (modus.modus === 'vorstellungsrunde') {
    return NextResponse.json({
      modus: 'vorstellungsrunde',
      slots: [],
      runden: modus.runden.map((r) => ({
        id: r.id,
        start: r.starts_at,
        end: r.ends_at,
        adresse: vollstaendigeAdresse(r.adresse, r.hinweis),
        freie_plaetze: r.freie_plaetze,
      })),
      appointment,
    });
  }

  const ergebnis = await ladeFreieSlots(svc, appt);
  if ('fehler' in ergebnis) {
    return NextResponse.json({ error: ergebnis.fehler }, { status: ergebnis.status });
  }
  const { slots } = ergebnis;

  return NextResponse.json({
    modus: 'einzel',
    slots: slots.map((s: { start: Date; end: Date }) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
    appointment: { ...appointment, location: appt.location ?? modus.ort },
  });
}
