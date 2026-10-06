import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeTermine, type AppointmentRow, type CandidateAppointmentRow } from '@/lib/termine/normalize';

const TAG = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/termine?von=YYYY-MM-DD&bis=YYYY-MM-DD
 * Alle Termine der (effektiven) Agentur aus beiden Terminsystemen, normalisiert.
 * `bis` ist inklusive. Für Kunde und Innendienst/Admin (Kunden-Login).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const von = req.nextUrl.searchParams.get('von') ?? '';
  const bis = req.nextUrl.searchParams.get('bis') ?? '';
  if (!TAG.test(von) || !TAG.test(bis) || von > bis) {
    return NextResponse.json({ error: 'Ungültiger Zeitraum' }, { status: 400 });
  }
  // einen Tag Puffer auf beiden Seiten (Zeitzonen) – der Client filtert pro Tag lokal
  const ab = new Date(new Date(`${von}T00:00:00Z`).getTime() - 864e5).toISOString();
  const bisExkl = new Date(new Date(`${bis}T00:00:00Z`).getTime() + 2 * 864e5).toISOString();

  const svc = createAdminClient();
  const [{ data: ka, error: e1 }, { data: ap, error: e2 }, { data: agency }] = await Promise.all([
    svc
      .from('candidate_appointments')
      .select('id, candidate_id, type, scheduled_at, status, notes')
      .eq('agency_id', agencyId)
      .gte('scheduled_at', ab)
      .lt('scheduled_at', bisExkl)
      .order('scheduled_at'),
    svc
      .from('appointments')
      .select('id, application_id, starts_at, ends_at, type, location, status')
      .eq('agency_id', agencyId)
      .gte('starts_at', ab)
      .lt('starts_at', bisExkl)
      .order('starts_at'),
    svc.from('agencies').select('calendar_feed_token').eq('id', agencyId).maybeSingle(),
  ]);
  if (e1 || e2) return NextResponse.json({ error: 'Termine konnten nicht geladen werden' }, { status: 500 });

  const kandidat = (ka ?? []) as CandidateAppointmentRow[];
  const bewerbung = (ap ?? []) as AppointmentRow[];

  // Bewerbung → Bewerber auflösen, dann alle Namen auf einmal laden
  const appIds = [...new Set(bewerbung.map((a) => a.application_id).filter((x): x is string => !!x))];
  const { data: apps } = appIds.length
    ? await svc.from('applications').select('id, candidate_id').in('id', appIds).eq('agency_id', agencyId)
    : { data: [] };
  const bewerbungZuKandidat = new Map(((apps ?? []) as Array<{ id: string; candidate_id: string }>).map((a) => [a.id, a.candidate_id]));

  const kandidatIds = [...new Set([...kandidat.map((k) => k.candidate_id), ...bewerbungZuKandidat.values()])];
  const { data: cands } = kandidatIds.length
    ? await svc.from('candidates').select('id, name').in('id', kandidatIds).eq('agency_id', agencyId)
    : { data: [] };
  const namen = new Map(((cands ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));

  const token = (agency as { calendar_feed_token: string | null } | null)?.calendar_feed_token ?? null;
  return NextResponse.json({
    termine: normalizeTermine(kandidat, bewerbung, namen, bewerbungZuKandidat),
    feedUrl: token ? `/api/calendar/${token}` : null,
  });
}
