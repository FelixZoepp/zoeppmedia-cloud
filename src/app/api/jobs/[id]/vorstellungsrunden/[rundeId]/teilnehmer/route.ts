import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { bookAppointment, createProposedAppointment } from '@/lib/appointments/lifecycle';
import { RUNDE_VORLAUF_MS, vollstaendigeAdresse } from '@/lib/appointments/termin-format';

/**
 * POST { application_id }: Bewerber in eine Vorstellungsrunde eintragen (z. B. nach dem Telefonat).
 * Bestätigung + Erinnerungen laufen wie bei jeder Buchung über bookAppointment → send.ts (Bewerber-Kontakt-Schalter).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; rundeId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });
  const agencyId = await getEffectiveAgencyId(user);
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const { id: jobId, rundeId } = await params;
  let body: { application_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }
  if (!body.application_id) return NextResponse.json({ error: 'Bewerbung fehlt' }, { status: 400 });

  const svc = createAdminClient();
  const { data: runde } = await svc.from('vorstellungsrunden')
    .select('id, starts_at, ends_at, adresse, hinweis')
    .eq('id', rundeId).eq('job_id', jobId).eq('agency_id', agencyId).maybeSingle();
  if (!runde) return NextResponse.json({ error: 'Runde nicht gefunden' }, { status: 404 });
  if (new Date(runde.starts_at).getTime() < Date.now() + RUNDE_VORLAUF_MS) {
    return NextResponse.json({ error: 'Die Runde beginnt zu bald – bitte eine spätere wählen' }, { status: 409 });
  }

  const { data: app } = await svc.from('applications')
    .select('id').eq('id', body.application_id).eq('job_id', jobId).eq('agency_id', agencyId).maybeSingle();
  if (!app) return NextResponse.json({ error: 'Bewerbung nicht gefunden' }, { status: 404 });

  const ort = vollstaendigeAdresse(runde.adresse, runde.hinweis);
  const { appointmentId } = await createProposedAppointment(svc, {
    agencyId, applicationId: app.id, type: 'onsite', location: ort,
  });
  try {
    await bookAppointment(svc, {
      agencyId, appointmentId,
      startsAt: new Date(runde.starts_at), endsAt: new Date(runde.ends_at),
      bookedVia: 'team', vorstellungsrundeId: runde.id, location: ort,
    });
  } catch (err) {
    // Buchung gescheitert (z. B. Runde voll): verwaisten Vorschlag entfernen
    await svc.from('appointments').delete().eq('id', appointmentId).eq('agency_id', agencyId).eq('status', 'proposed');
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('ausgebucht')) return NextResponse.json({ error: 'Die Runde ist voll' }, { status: 409 });
    if (msg.includes('vergeben')) return NextResponse.json({ error: 'Bewerber ist in dieser Runde bereits gebucht' }, { status: 409 });
    return NextResponse.json({ error: 'Bewerber konnte nicht eingetragen werden' }, { status: 500 });
  }
  return NextResponse.json({ appointment_id: appointmentId }, { status: 201 });
}
