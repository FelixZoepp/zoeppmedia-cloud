import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildIndeedFeed, FeedJob } from '@/lib/indeed/feed';
import { timingSafeEqual } from 'crypto';

/** GET /api/feeds/indeed/{org_slug}.xml?key={secret} — XML-Feed je Mandant (Spec §5). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params;
  // Indeed hängt optional .xml an den Slug — entfernen für DB-Lookup.
  const slug = rawSlug.replace(/\.xml$/, '');
  const key = request.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = createAdminClient();

  const { data: agency } = await svc
    .from('agencies')
    .select('id, name, slug, indeed_feed_key')
    .eq('slug', slug)
    .single();
  if (!agency) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  // Timing-sicherer Schlüsselvergleich — fail-closed bei unterschiedlicher Länge.
  const a = Buffer.from(key);
  const b = Buffer.from(agency.indeed_feed_key as string);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Nur aktive Jobs mit Indeed-Modus apply oder redirect liefern.
  // DB-Spalte heißt `location`; FeedJob-Interface erwartet `city` → umbenennen.
  const { data: rawJobs } = await svc
    .from('jobs')
    .select('id, title, slug, location, description, indeed_mode, created_at, external_ref')
    .eq('agency_id', agency.id)
    .eq('status', 'active')
    .in('indeed_mode', ['apply', 'redirect']);

  const jobs: FeedJob[] = (rawJobs ?? []).map((j) => ({
    id: j.id,
    title: j.title,
    slug: j.slug,
    city: j.location ?? null,
    description: j.description ?? null,
    indeed_mode: j.indeed_mode as 'apply' | 'redirect',
    created_at: j.created_at,
    external_ref: j.external_ref ?? null,
  }));

  // Feed-Abruf fürs Monitoring protokollieren (best effort).
  await svc.from('feed_polls').insert({ agency_id: agency.id }).then(
    () => {},
    (e: unknown) => console.error('[indeed-feed] feed_polls insert fehlgeschlagen', e)
  );

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';
  const xml = buildIndeedFeed({
    agencyName: agency.name,
    agencySlug: agency.slug,
    baseUrl,
    jobs,
  });

  return new NextResponse(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
