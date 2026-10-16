import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { MIN_DAUER_MINUTEN, MAX_DAUER_MINUTEN } from '@/lib/appointments/freie-slots';
import { istSchemaFehler, istTerminFormat, terminTypFuerFormat } from '@/lib/appointments/termin-format';
import { ladeTerminEinstellung } from '@/lib/appointments/vorstellungsrunden';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const { id: jobId } = await params;
  const svc = createAdminClient();

  const { data: rules } = await svc
    .from('availability_rules')
    .select('*')
    .eq('job_id', jobId)
    .eq('agency_id', agencyId)
    .order('weekday')
    .order('start_time');

  const { data: job } = await svc
    .from('jobs')
    .select('appointment_type, appointment_location, appointment_duration_minutes, appointment_buffer_minutes')
    .eq('id', jobId)
    .eq('agency_id', agencyId)
    .single();

  // Termin-Format (ohne Migration aus appointment_type abgeleitet)
  const einstellung = job ? await ladeTerminEinstellung(svc, agencyId, jobId) : null;

  return NextResponse.json({
    rules: rules ?? [],
    job: job ?? {},
    termin_format: einstellung?.format ?? 'telefon',
    standard_adresse: einstellung?.standardAdresse ?? '',
    migration_fehlt: einstellung?.migrationFehlt ?? false,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const { id: jobId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  const svc = createAdminClient();

  if (body.termin_format !== undefined && !istTerminFormat(body.termin_format)) {
    return NextResponse.json({ error: 'Ungültiges Termin-Format' }, { status: 400 });
  }
  if (body.termin_format === 'vorstellungsrunde') {
    const einstellung = await ladeTerminEinstellung(svc, agencyId, jobId);
    if (!einstellung) return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 });
    if (einstellung.migrationFehlt) {
      return NextResponse.json({ error: 'Datenbank-Änderung fehlt noch – Vorstellungsrunden sind noch nicht verfügbar' }, { status: 409 });
    }
  }

  // Regeln ersetzen (Delete + Insert)
  // Dauer 0 würde die Slot-Berechnung endlos laufen lassen – vor jedem Schreibvorgang prüfen
  if (body.appointment_duration_minutes !== undefined) {
    const dauer = Number(body.appointment_duration_minutes);
    if (!Number.isInteger(dauer) || dauer < MIN_DAUER_MINUTEN || dauer > MAX_DAUER_MINUTEN) {
      return NextResponse.json({ error: `Termindauer muss zwischen ${MIN_DAUER_MINUTEN} und ${MAX_DAUER_MINUTEN} Minuten liegen` }, { status: 400 });
    }
  }
  if (body.appointment_buffer_minutes !== undefined) {
    const puffer = Number(body.appointment_buffer_minutes);
    if (!Number.isInteger(puffer) || puffer < 0 || puffer > 240) {
      return NextResponse.json({ error: 'Puffer muss zwischen 0 und 240 Minuten liegen' }, { status: 400 });
    }
  }

  const rules = body.rules as Array<{ weekday: number; start_time: string; end_time: string }> | undefined;
  if (rules !== undefined) {
    // Validierung
    for (const r of rules) {
      if (r.weekday < 0 || r.weekday > 6) {
        return NextResponse.json({ error: 'Ungültiger Wochentag' }, { status: 400 });
      }
      if (!r.start_time || !r.end_time || r.start_time >= r.end_time) {
        return NextResponse.json({ error: 'Ungültige Zeitspanne' }, { status: 400 });
      }
    }

    // Bestehende Regeln löschen
    await svc
      .from('availability_rules')
      .delete()
      .eq('job_id', jobId)
      .eq('agency_id', agencyId);

    // Neue Regeln einfügen (nur wenn vorhanden)
    if (rules.length > 0) {
      await svc.from('availability_rules').insert(
        rules.map((r) => ({
          agency_id: agencyId,
          job_id: jobId,
          weekday: r.weekday,
          start_time: r.start_time,
          end_time: r.end_time,
        })),
      );
    }
  }

  // Job-Spalten aktualisieren
  const jobUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.appointment_type !== undefined) jobUpdate.appointment_type = body.appointment_type;
  // Format bestimmt den Termintyp (Telefon/Video/vor Ort)
  if (istTerminFormat(body.termin_format)) {
    jobUpdate.appointment_type = terminTypFuerFormat(body.termin_format);
    jobUpdate.termin_format = body.termin_format;
  }
  if (body.appointment_location !== undefined) jobUpdate.appointment_location = body.appointment_location;
  if (body.appointment_duration_minutes !== undefined) jobUpdate.appointment_duration_minutes = Number(body.appointment_duration_minutes);
  if (body.appointment_buffer_minutes !== undefined) jobUpdate.appointment_buffer_minutes = Number(body.appointment_buffer_minutes);

  const { error } = await svc
    .from('jobs')
    .update(jobUpdate)
    .eq('id', jobId)
    .eq('agency_id', agencyId);

  if (error && 'termin_format' in jobUpdate && istSchemaFehler(error)) {
    // Migration fehlt: Vorstellungsrunde geht noch nicht, Einzelformate wie bisher über appointment_type
    if (body.termin_format === 'vorstellungsrunde') {
      return NextResponse.json({ error: 'Datenbank-Änderung fehlt noch – Vorstellungsrunden sind noch nicht verfügbar' }, { status: 409 });
    }
    delete jobUpdate.termin_format;
    const retry = await svc.from('jobs').update(jobUpdate).eq('id', jobId).eq('agency_id', agencyId);
    if (retry.error) return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 });
  } else if (error) {
    return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
