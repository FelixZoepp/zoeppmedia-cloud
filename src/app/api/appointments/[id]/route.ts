import { NextRequest, NextResponse } from 'next/server';
import { requireSchreibNutzer } from '@/lib/recruiting/agency-scope';
import { probetagZeiten } from '@/lib/termine/probetag';
import { createServerClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/activity/log';
import { fireEvent } from '@/lib/automations/fire';
import { sendAppointmentUpdateEmail, sendAgencyCalendarInvite } from '@/lib/email/resend';
import { buildAppointmentInvite, APPOINTMENT_TYPE_LABELS } from '@/lib/calendar/invite';
import { AUTO_SPERRE_PREFIX, noShowPunktWechsel } from '@/lib/appointments/noshow-wechsel';

const STATUSES = ['geplant', 'erschienen', 'no_show', 'abgesagt'];

/**
 * No-Show am Termin → ±1 Punkt im bestehenden No-Show-System, Blacklist ab 3 Punkten.
 * delta −1 (No-Show zurückgenommen) bucht einen Korrektur-Eintrag und hebt eine automatische Sperre unter 3 Punkten wieder auf.
 */
async function recordNoShowPoints(
  supabase: SupabaseClient,
  userId: string,
  candidateId: string,
  agencyId: string,
  appointmentType: string,
  delta: 1 | -1 = 1,
) {
  await supabase.from('noshow_events').insert({
    agency_id: agencyId,
    candidate_id: candidateId,
    event_type: delta > 0 ? 'no_show' : 'point_override',
    points: delta,
    appointment_type: appointmentType,
    reason: delta > 0 ? null : 'No-Show zurückgenommen (Terminstatus geändert)',
    created_by: userId,
  });

  const [{ data: allEvents }, { data: cand }] = await Promise.all([
    supabase.from('noshow_events').select('points').eq('candidate_id', candidateId),
    supabase.from('candidates').select('blacklisted, blacklist_reason').eq('id', candidateId).maybeSingle(),
  ]);
  const totalPoints = Math.max(0, (allEvents ?? []).reduce((sum, e) => sum + Number(e.points), 0));

  const updateData: Record<string, unknown> = { noshow_points: totalPoints };
  if (delta > 0 && totalPoints >= 3) {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 12);
    updateData.blacklisted = true;
    updateData.blacklisted_at = new Date().toISOString();
    updateData.blacklisted_by = userId;
    updateData.blacklist_reason = `${AUTO_SPERRE_PREFIX} ${totalPoints} No-Show Punkte`;
    updateData.blacklist_expires_at = expiresAt.toISOString();
  }
  // Zurückgenommen und wieder unter 3: nur die automatische No-Show-Sperre aufheben, manuelle Sperren bleiben
  const c = cand as { blacklisted: boolean | null; blacklist_reason: string | null } | null;
  if (delta < 0 && totalPoints < 3 && c?.blacklisted && (c.blacklist_reason ?? '').startsWith(AUTO_SPERRE_PREFIX)) {
    Object.assign(updateData, { blacklisted: false, blacklisted_at: null, blacklisted_by: null, blacklist_reason: null, blacklist_expires_at: null });
  }
  await supabase.from('candidates').update(updateData).eq('id', candidateId).eq('agency_id', agencyId);

  if (delta > 0) fireEvent('noshow_recorded', agencyId, { candidate_id: candidateId }).catch(() => {});

  return totalPoints;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const user = await requireSchreibNutzer();
  if (user instanceof NextResponse) return user;

  const body = await request.json();

  const { data: appointment } = await supabase
    .from('candidate_appointments')
    .select('id, candidate_id, agency_id, type, status, scheduled_at, notes, ics_sequence, kalender_event_id, kalender_provider')
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

  // Von Hiring Lisa gebuchter Termin: Erschienen / No-Show an Lisa melden (best effort, nichts an den Bewerber)
  const lisaTerminId = (data as { lisa_appointment_id?: string | null } | null)?.lisa_appointment_id;
  if (lisaTerminId && (body.status === 'erschienen' || body.status === 'no_show')) {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { meldeAnwesenheitAnLisa } = await import('@/lib/lisa/senden');
    await meldeAnwesenheitAnLisa(createAdminClient(), appointment.agency_id, lisaTerminId, body.status === 'erschienen').catch(() => false);
  }

  // Verbundener Kundenkalender: Termin dort verschieben bzw. löschen
  let kalenderNachgezogen = false;
  if ((rescheduled || cancelled) && appointment.kalender_event_id && appointment.kalender_provider) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const k = await import('@/lib/kalender/kunden-kalender');
      const svc = createAdminClient();
      const provider = appointment.kalender_provider as import('@/lib/kalender/kunden-kalender').KalenderProvider;
      // Mehrere Probetage: kommagetrennte IDs, je Tag ein Eintrag
      const ids = String(appointment.kalender_event_id).split(',').filter(Boolean);
      if (cancelled) {
        for (const eventId of ids) await k.loescheTermin(svc, appointment.agency_id, eventId, provider);
      } else {
        const minuten = appointment.type === 'probetag' ? 240 : 60;
        const zeiten = probetagZeiten(new Date(body.scheduled_at), ids.length, minuten);
        for (const [i, eventId] of ids.entries()) await k.aktualisiereTermin(svc, appointment.agency_id, eventId, provider, zeiten[i].start, zeiten[i].ende);
      }
      kalenderNachgezogen = true;
    } catch (e) {
      console.error('[termin] Kundenkalender nicht nachgezogen – Einladung per Mail', e);
    }
  }

  // Verschiebung/Absage → Kalender-Update an den Kunden (Bewerber-Mail nur bei Verschiebung mit Freigabe)
  // Für die Oberfläche: wer wurde tatsächlich informiert? (false → der Kunde muss den Bewerber selbst informieren)
  let bewerberInformiert = false;
  let kundeInformiert = false;
  if (rescheduled || cancelled) {
    const kind = cancelled ? 'abgesagt' as const : 'verschoben' as const;
    const method = cancelled ? 'CANCEL' as const : 'REQUEST' as const;
    const scheduledAt = new Date((data.scheduled_at as string) ?? appointment.scheduled_at);
    const typeLabelInvite = APPOINTMENT_TYPE_LABELS[appointment.type] ?? appointment.type;

    const [{ data: candidate }, { data: agency }] = await Promise.all([
      supabase.from('candidates').select('name, email, phone, abgesagt_am').eq('id', appointment.candidate_id).single(),
      supabase.from('agencies').select('name, email').eq('id', appointment.agency_id).single(),
    ]);

    if (candidate) {
      const agencyName = agency?.name ?? 'Zoepp Cloud';
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

      // Absage: nie eine Mail an den Bewerber (auch nicht mit Grund) – nur intern + Kundenkalender.
      // Verschiebung: nur, wenn der Bewerber-Kontakt freigegeben ist (Admin → Bewerber-Kontakt).
      const { ladeSchalter, darfKontakt } = await import('@/lib/recruiting/kontakt-schalter');
      const { createAdminClient } = await import('@/lib/supabase/admin');
      // Abgesagte Bewerber bekommen nie eine Nachricht.
      const mailAnBewerber =
        !cancelled &&
        !candidate.abgesagt_am &&
        !!candidate.email &&
        darfKontakt(await ladeSchalter(createAdminClient()), { email: candidate.email, agencyId: appointment.agency_id as string });
      bewerberInformiert = mailAnBewerber;
      if (mailAnBewerber && candidate.email) {
        sendAppointmentUpdateEmail(
          candidate.email,
          candidate.name,
          typeLabelInvite,
          scheduledAt,
          agencyName,
          inviteBase.notes,
          buildAppointmentInvite({ ...inviteBase, attendeeEmail: candidate.email, attendeeName: candidate.name }),
        ).catch(() => {});
      }

      kundeInformiert = kalenderNachgezogen || !!agency?.email;
      if (agency?.email && !kalenderNachgezogen) {
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

  // No-Show → Punkte im bestehenden No-Show-System (Blacklist ab 3) – nur beim echten Wechsel auf/von no_show
  let noshowPoints: number | null = null;
  const wechsel = noShowPunktWechsel(appointment.status as string | null, body.status as string | undefined);
  if (wechsel !== 0) {
    noshowPoints = await recordNoShowPoints(
      supabase,
      user.id,
      appointment.candidate_id,
      appointment.agency_id,
      appointment.type,
      wechsel,
    );
  }

  return NextResponse.json({ ...data, noshow_points: noshowPoints, bewerber_informiert: bewerberInformiert, kunde_informiert: kundeInformiert });
}
