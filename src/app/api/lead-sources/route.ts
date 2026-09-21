import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { randomBytes } from 'crypto';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';

const createSchema = z.object({
  kind: z.enum(['meta', 'generic']),
  name: z.string().min(1).max(120),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(_request?: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const svc = createAdminClient();

  const [sourcesResult, agencyResult] = await Promise.all([
    svc
      .from('lead_sources')
      .select('id, agency_id, kind, name, config, active, created_at')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false }),
    svc
      .from('agencies')
      .select('slug, indeed_feed_key')
      .eq('id', agencyId)
      .single(),
  ]);

  if (sourcesResult.error) {
    return NextResponse.json({ error: sourcesResult.error.message }, { status: 500 });
  }

  const agency = agencyResult.data;
  const feedUrl = agency
    ? `${BASE_URL}/api/feeds/indeed/${agency.slug}.xml?key=${agency.indeed_feed_key}`
    : null;

  return NextResponse.json({
    sources: sourcesResult.data ?? [],
    feed: { url: feedUrl },
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { kind, name, config } = parsed.data;
  const secret = kind === 'generic' ? randomBytes(24).toString('hex') : null;

  const svc = createAdminClient();

  const { data: source, error } = await svc
    .from('lead_sources')
    .insert({
      agency_id: agencyId,
      kind,
      name,
      secret,
      config: config ?? null,
      active: true,
    })
    .select('id, agency_id, kind, name, config, active, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Secret nur einmalig als eigenes Top-Level-Feld — nie eingebettet im source-Objekt
  const { secret: _ignored, ...sourceWithoutSecret } = source as Record<string, unknown>;
  const response: Record<string, unknown> = { source: sourceWithoutSecret };
  if (kind === 'generic') {
    response.secret = secret;
    response.webhook_url = `${BASE_URL}/api/webhooks/generic/${source.id}`;
  }

  return NextResponse.json(response, { status: 201 });
}
