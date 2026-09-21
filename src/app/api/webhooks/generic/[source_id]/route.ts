import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';
import { randomUUID, timingSafeEqual } from 'crypto';

/** Best-effort Audit-Eintrag bei abgelehntem Webhook — darf den 401-Pfad nie blockieren. */
async function auditReject(
  svc: ReturnType<typeof createAdminClient>,
  agencyId: string,
  reason: string
) {
  await svc.from('audit_log').insert({
    entity_type: 'webhook',
    entity_id: randomUUID(),
    agency_id: agencyId,
    action: 'reject',
    changes: { source: 'generic', reason },
  }).then(
    () => {},
    (e: unknown) => console.error('[generic-webhook] Audit-Insert fehlgeschlagen', e)
  );
}

/** POST /api/webhooks/generic/{source_id} — externe Formulare/Perspective (Spec §6/§13). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ source_id: string }> }
) {
  const { source_id } = await params;
  if (!isUuid(source_id)) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  const svc = createAdminClient();
  const { data: source } = await svc
    .from('lead_sources')
    .select('id, agency_id, secret, active, kind')
    .eq('id', source_id)
    .eq('kind', 'generic')
    .single();
  if (!source || !source.active) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  // Fail-closed: ohne konfiguriertes Secret keine Annahme
  const provided = request.headers.get('x-webhook-secret');
  if (!source.secret || !provided) {
    await auditReject(svc, source.agency_id, 'missing_secret');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(source.secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await auditReject(svc, source.agency_id, 'invalid_secret');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 });
  }

  const externalId = typeof body.id === 'string' ? `${source.id}:${body.id}` : null;
  const { error } = await svc.from('events_inbox').insert({
    source: 'generic',
    external_id: externalId,
    agency_id: source.agency_id,
    payload: { type: 'ingest.generic', source_id: source.id, body },
  });
  if (error) {
    if (error.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
    console.error('[generic-webhook] events_inbox insert fehlgeschlagen', error.message);
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
