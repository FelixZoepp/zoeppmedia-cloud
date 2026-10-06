import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAgency } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { agencyLogo } from '@/lib/branding/logo';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';
import { bauLiveBewerber, klemmeSeit, siehtLiveBewerber } from '@/lib/live/bewerber';

/**
 * GET /api/live/bewerber?seit=<ISO> – neue Bewerber seit dem letzten Abruf (für den Live-Hinweis).
 * Kunden: nur die eigene Agentur. Intern: Admins, Innendienst, Kundenberater → alle Kunden.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  const jetzt = new Date();
  const leer = { bewerber: [], jetzt: jetzt.toISOString() };
  if (!siehtLiveBewerber(user)) return NextResponse.json(leer);

  const seit = klemmeSeit(req.nextUrl.searchParams.get('seit'), jetzt);
  const svc = createAdminClient();

  let q = svc
    .from('candidates')
    .select('id, name, created_at, source, indeed_job_title, meta_campaign, agency_id')
    .is('deleted_at', null)
    .gt('created_at', seit)
    .order('created_at', { ascending: false })
    .limit(10);
  if (isAgency(user.role)) {
    if (!user.agency_id) return NextResponse.json(leer);
    q = q.eq('agency_id', user.agency_id);
  } else {
    q = q.not('agency_id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: 'Laden fehlgeschlagen' }, { status: 500 });
  const zeilen = (data ?? []) as Parameters<typeof bauLiveBewerber>[0];
  if (!zeilen.length) return NextResponse.json(leer);

  const ids = zeilen.map((z) => z.id);
  const agencyIds = [...new Set(zeilen.map((z) => z.agency_id))];
  const [{ data: apps }, { data: ags }] = await Promise.all([
    svc.from('applications').select('candidate_id, jobs(title)').in('candidate_id', ids),
    svc.from('agencies').select('id, name, settings').in('id', agencyIds),
  ]);

  const stellen = new Map<string, string>();
  for (const a of (apps ?? []) as Array<{ candidate_id: string; jobs: { title: string | null } | { title: string | null }[] | null }>) {
    const job = Array.isArray(a.jobs) ? a.jobs[0] : a.jobs;
    if (job?.title && !stellen.has(a.candidate_id)) stellen.set(a.candidate_id, job.title);
  }
  const agencies = new Map(
    ((ags ?? []) as Array<{ id: string; name: string; settings: unknown }>).map((a) => [a.id, { name: a.name, logo_url: agencyLogo(a.settings) }]),
  );

  return NextResponse.json({ bewerber: bauLiveBewerber(zeilen, stellen, agencies), jetzt: jetzt.toISOString() });
}
