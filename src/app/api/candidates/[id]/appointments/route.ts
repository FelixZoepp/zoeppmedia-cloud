import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { fireEvent } from '@/lib/automations/fire';
import { sendAppointmentConfirmationEmail, sendAgencyCalendarInvite } from '@/lib/email/resend';
import { buildAppointmentInvite } from '@/lib/calendar/invite';

const APPOINTMENT_TYPES = ['vorstellungsgespraech', 'probetag'];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('candidate_appointments')
    .select('*')
    .eq('candidate_id', id)
    .order('scheduled_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  if (!APPOINTMENT_TYPES.includes(body.type)) {
    return NextResponse.json({ error: 'Ungültiger Termin-Typ.' }, { status: 400 });
  }
  if (!body.scheduled_at || isNaN(Date.parse(body.scheduled_at))) {
    return NextResponse.json({ error: 'Gültiges Datum erforderlich.' }, { status: 400 });
  }

  const { data: candidate } = await supabase
    .from('candidates')
    .select('agency_id, name, email, phone')
    .eq('id', id)
    .single();

  if (!candidate) return NextResponse.json({ error: 'Bewerber nicht gefunden.' }, { status: 404 });

  const { data, error } = await supabase
    .from('candidate_appointments')
    .insert({
      candidate_id: id,
      agency_id: candidate.agency_id,
      type: body.type,
      scheduled_at: body.scheduled_at,
      notes: body.notes || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const typeLabel = body.type === 'probetag' ? 'Probetag' : 'Vorstellungsgespräch';
  await logActivity(supabase, {
    agency_id: candidate.agency_id,
    user_id: user.id,
    candidate_id: id,
    action: `${typeLabel} terminiert für ${new Date(body.scheduled_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
    action_type: 'other',
    metadata: { appointment_id: data.id, type: body.type, scheduled_at: body.scheduled_at },
  });

  fireEvent('appointment_created', candidate.agency_id, {
    candidate_id: id,
    extra: { appointment_id: data.id, type: body.type },
  }).catch(() => {});

  const { data: agency } = await supabase
    .from('agencies')
    .select('name, email')
    .eq('id', candidate.agency_id)
    .single();
  const agencyName = agency?.name ?? 'Zoepp Media Cloud';
  const scheduledAt = new Date(body.scheduled_at);
  const inviteBase = {
    appointmentId: data.id as string,
    type: body.type as string,
    scheduledAt,
    sequence: 0,
    method: 'REQUEST' as const,
    candidateName: candidate.name,
    candidatePhone: candidate.phone,
    notes: body.notes || null,
    agencyName,
  };

  // Bestätigungs-Mail + Kalender-Einladung an den Bewerber
  let confirmationSent = false;
  if (candidate.email) {
    try {
      await sendAppointmentConfirmationEmail(
        candidate.email,
        candidate.name,
        typeLabel,
        scheduledAt,
        agencyName,
        body.notes || null,
        buildAppointmentInvite({ ...inviteBase, attendeeEmail: candidate.email, attendeeName: candidate.name }),
      );
      confirmationSent = true;
    } catch {
      // Mail-Fehler soll das Anlegen nicht blockieren
    }
  }

  // Kalender-Einladung an den Kunden — Termin landet sofort in seinem Kalender
  if (agency?.email) {
    const dateStr = scheduledAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' });
    sendAgencyCalendarInvite(
      agency.email,
      `Neuer Termin: ${typeLabel} mit ${candidate.name} — ${dateStr}`,
      `<p>Neuer Termin für <strong>${agencyName}</strong>: <strong>${typeLabel}</strong> mit <strong>${candidate.name}</strong> am ${dateStr} Uhr.</p><p>Die Einladung im Anhang trägt den Termin automatisch in deinen Kalender ein.</p>`,
      buildAppointmentInvite({ ...inviteBase, attendeeEmail: agency.email, attendeeName: agencyName }),
    ).catch(() => {});
  }

  return NextResponse.json({ ...data, confirmation_sent: confirmationSent }, { status: 201 });
}
