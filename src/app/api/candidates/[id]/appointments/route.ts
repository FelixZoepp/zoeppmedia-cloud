import { NextRequest, NextResponse } from 'next/server';
import { requireSchreibNutzer } from '@/lib/recruiting/agency-scope';
import { probetagLabel, probetagTage, probetagZeiten } from '@/lib/termine/probetag';
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

  const user = await requireSchreibNutzer();
  if (user instanceof NextResponse) return user;

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

  // Probetag-Format des Kunden: 1 Tag, 3 Tage hintereinander oder Probewoche
  const { data: agency } = await supabase
    .from('agencies')
    .select('name, email, settings')
    .eq('id', candidate.agency_id)
    .single();
  const tage = body.type === 'probetag' ? probetagTage(agency?.settings) : 1;
  const typeLabel = body.type === 'probetag' ? probetagLabel(tage) : 'Vorstellungsgespräch';
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
  // Nur mit freigegebenem Bewerber-Kontakt (Admin → Bewerber-Kontakt) – sonst geht keine Mail raus
  let confirmationSent = false;
  const { ladeSchalter, darfKontakt } = await import('@/lib/recruiting/kontakt-schalter');
  const { createAdminClient: adminFuerSchalter } = await import('@/lib/supabase/admin');
  if (candidate.email && darfKontakt(await ladeSchalter(adminFuerSchalter()), { email: candidate.email, agencyId: candidate.agency_id })) {
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

  // Verbundener Kundenkalender (Google/Outlook): Termin direkt eintragen – sonst Einladung per Mail
  let imKalender = false;
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { trageTerminEin } = await import('@/lib/kalender/kunden-kalender');
    const svc = createAdminClient();
    const minuten = Math.min(600, Math.max(15, Number(body.dauer_minuten) || (body.type === 'probetag' ? 240 : 60)));
    const beschreibung = [`${typeLabel} mit ${candidate.name}`, candidate.phone ? `Telefon: ${candidate.phone}` : '', candidate.email ? `E-Mail: ${candidate.email}` : '', body.notes ? `Notiz: ${body.notes}` : '', `Bewerber in der Cloud: ${process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de'}/candidates/${id}`].filter(Boolean).join('\n');
    // Mehrere Probetage: je Tag ein Kalendereintrag (IDs kommagetrennt, damit Verschieben/Absagen alle Tage trifft)
    const zeiten = probetagZeiten(scheduledAt, tage, minuten);
    const ids: string[] = [];
    let provider: string | null = null;
    for (const [i, z] of zeiten.entries()) {
      const ev = await trageTerminEin(svc, candidate.agency_id, {
        start: z.start,
        ende: z.ende,
        titel: zeiten.length > 1 ? `Probetag ${i + 1}/${zeiten.length}: ${candidate.name}` : `${typeLabel}: ${candidate.name}`,
        beschreibung,
      });
      if (!ev) break;
      ids.push(ev.eventId);
      provider = ev.provider;
    }
    if (ids.length && provider) {
      imKalender = true;
      await svc.from('candidate_appointments').update({ kalender_event_id: ids.join(','), kalender_provider: provider }).eq('id', data.id);
    }
  } catch (e) {
    console.error('[termin] Kundenkalender nicht erreicht – Einladung per Mail', e);
  }

  // Kalender-Einladung an den Kunden — Termin landet sofort in seinem Kalender
  if (agency?.email && !imKalender) {
    const dateStr = scheduledAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' });
    sendAgencyCalendarInvite(
      agency.email,
      `Neuer Termin: ${typeLabel} mit ${candidate.name} — ${dateStr}`,
      `<p>Neuer Termin für <strong>${agencyName}</strong>: <strong>${typeLabel}</strong> mit <strong>${candidate.name}</strong> am ${dateStr} Uhr.</p><p>Die Einladung im Anhang trägt den Termin automatisch in deinen Kalender ein.</p>`,
      buildAppointmentInvite({ ...inviteBase, attendeeEmail: agency.email, attendeeName: agencyName }),
    ).catch(() => {});
  }

  return NextResponse.json({ ...data, confirmation_sent: confirmationSent, im_kundenkalender: imKalender }, { status: 201 });
}
