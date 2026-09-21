import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';

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

  return NextResponse.json({ rules: rules ?? [], job: job ?? {} });
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

  // Regeln ersetzen (Delete + Insert)
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
  if (body.appointment_location !== undefined) jobUpdate.appointment_location = body.appointment_location;
  if (body.appointment_duration_minutes !== undefined) jobUpdate.appointment_duration_minutes = body.appointment_duration_minutes;
  if (body.appointment_buffer_minutes !== undefined) jobUpdate.appointment_buffer_minutes = body.appointment_buffer_minutes;

  await svc
    .from('jobs')
    .update(jobUpdate)
    .eq('id', jobId)
    .eq('agency_id', agencyId);

  return NextResponse.json({ ok: true });
}
