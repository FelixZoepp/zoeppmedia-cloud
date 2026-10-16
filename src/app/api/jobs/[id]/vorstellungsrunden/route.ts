import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { belegtePlaetze, freiePlaetze, lokaleZeitAlsUtc } from '@/lib/appointments/termin-format';
import { ladeRunden, ladeTerminEinstellung } from '@/lib/appointments/vorstellungsrunden';

const MIGRATION_FEHLT = 'Datenbank-Änderung fehlt noch – Vorstellungsrunden sind noch nicht verfügbar';

/** GET: Runden der Stelle mit gebuchten Bewerbern + Bewerbungen, die noch hinzugefügt werden können */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const { id: jobId } = await params;
  const svc = createAdminClient();

  const einstellung = await ladeTerminEinstellung(svc, agencyId, jobId);
  if (!einstellung) return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 });
  if (einstellung.migrationFehlt) return NextResponse.json({ migration_fehlt: true, runden: [], bewerbungen: [] });

  // Vergangene Runden der letzten 30 Tage bleiben sichtbar (erschienen / No-Show nachtragen)
  const geladen = await ladeRunden(svc, agencyId, jobId, { ab: new Date(Date.now() - 30 * 864e5), mitTeilnehmern: true });
  if (!geladen) return NextResponse.json({ migration_fehlt: true, runden: [], bewerbungen: [] });

  const belegt = belegtePlaetze(geladen.teilnehmer);
  const sichtbar = new Set(['booked', 'confirmed', 'done', 'no_show']);
  const runden = geladen.runden.map((r) => ({
    ...r,
    freie_plaetze: freiePlaetze(r, belegt),
    teilnehmer: geladen.teilnehmer
      .filter((t) => t.vorstellungsrunde_id === r.id && sichtbar.has(t.status))
      .map((t) => ({ appointment_id: t.id, candidate_id: t.candidate_id, name: t.name, telefon: t.telefon, status: t.status })),
  }));

  // Bewerbungen der Stelle ohne aktive Buchung in einer anstehenden Runde
  const jetzt = Date.now();
  const anstehend = new Set(geladen.runden.filter((r) => new Date(r.starts_at).getTime() > jetzt).map((r) => r.id));
  const gebucht = new Set(
    geladen.teilnehmer
      .filter((t) => t.vorstellungsrunde_id && anstehend.has(t.vorstellungsrunde_id) && ['booked', 'confirmed'].includes(t.status))
      .map((t) => t.application_id),
  );
  const { data: apps } = await svc.from('applications')
    .select('id, candidate_id, created_at')
    .eq('agency_id', agencyId).eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(300);
  const offen = ((apps ?? []) as Array<{ id: string; candidate_id: string }>).filter((a) => !gebucht.has(a.id));
  const kandIds = [...new Set(offen.map((a) => a.candidate_id))];
  const { data: kand } = kandIds.length
    ? await svc.from('candidates').select('id, name').eq('agency_id', agencyId).in('id', kandIds)
    : { data: [] };
  const namen = new Map(((kand ?? []) as Array<{ id: string; name: string | null }>).map((c) => [c.id, c.name || 'Bewerber']));

  return NextResponse.json({
    migration_fehlt: false,
    standard_adresse: einstellung.standardAdresse,
    runden,
    bewerbungen: offen.map((a) => ({ id: a.id, name: namen.get(a.candidate_id) ?? 'Bewerber' })),
  });
}

/** POST: neue Runde anlegen { datum, uhrzeit, dauer_minuten, adresse, max_teilnehmer, hinweis } */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const einstellung = await ladeTerminEinstellung(svc, agencyId, jobId);
  if (!einstellung) return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 });
  if (einstellung.migrationFehlt) return NextResponse.json({ error: MIGRATION_FEHLT }, { status: 409 });

  const { data: agency } = await svc.from('agencies').select('timezone').eq('id', agencyId).maybeSingle();
  const start = lokaleZeitAlsUtc(String(body.datum ?? ''), String(body.uhrzeit ?? ''), (agency as { timezone?: string } | null)?.timezone || 'Europe/Berlin');
  if (!start || start.getTime() <= Date.now()) return NextResponse.json({ error: 'Bitte Datum und Uhrzeit in der Zukunft angeben' }, { status: 400 });
  const dauer = Number(body.dauer_minuten);
  if (!Number.isInteger(dauer) || dauer < 15 || dauer > 600) return NextResponse.json({ error: 'Dauer muss zwischen 15 und 600 Minuten liegen' }, { status: 400 });
  const max = Number(body.max_teilnehmer);
  if (!Number.isInteger(max) || max < 1 || max > 500) return NextResponse.json({ error: 'Max. Teilnehmer muss zwischen 1 und 500 liegen' }, { status: 400 });
  const adresse = String(body.adresse ?? '').trim().slice(0, 300);
  if (!adresse) return NextResponse.json({ error: 'Bitte die Adresse angeben' }, { status: 400 });
  const hinweis = String(body.hinweis ?? '').trim().slice(0, 200) || null;

  const { data, error } = await svc.from('vorstellungsrunden').insert({
    agency_id: agencyId,
    job_id: jobId,
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + dauer * 60_000).toISOString(),
    adresse,
    hinweis,
    max_teilnehmer: max,
    created_by: user.id,
  }).select('id').single();
  if (error || !data) return NextResponse.json({ error: 'Runde konnte nicht angelegt werden' }, { status: 500 });

  return NextResponse.json({ id: data.id }, { status: 201 });
}
