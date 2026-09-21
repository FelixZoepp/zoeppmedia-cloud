import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import { isUuid } from '@/lib/supabase/filters';

/**
 * POST /api/webhooks/indeed/apply — Indeed-Apply-Bewerbungen (Spec §5).
 * Nur Signatur prüfen + events_inbox schreiben; Verarbeitung asynchron im Cron-Tick.
 * Indeed signiert den Rohbody mit HMAC-SHA1 (Base64) im Header X-Indeed-Signature.
 */
export function verifyIndeedSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha1', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.INDEED_APPLY_SECRET;
  if (!secret) {
    console.error('[indeed-apply] INDEED_APPLY_SECRET nicht konfiguriert');
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 });
  }

  const rawBody = await request.text();
  const svc = createAdminClient();

  if (!verifyIndeedSignature(rawBody, request.headers.get('x-indeed-signature'), secret)) {
    // Audit-Eintrag für abgelehnte Signatur (Spec §5)
    await svc.from('audit_log').insert({
      entity_type: 'webhook',
      entity_id: randomUUID(),
      action: 'reject',
      changes: { source: 'indeed', reason: 'invalid_signature' },
    }).then(
      () => {},
      (e: unknown) => console.error('[indeed-apply] Audit-Insert fehlgeschlagen', e)
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 });
  }

  const applyId = typeof body.id === 'string' ? body.id : null;
  if (!applyId) return NextResponse.json({ error: 'id fehlt' }, { status: 400 });

  // Agentur über den Job auflösen (jobId = unsere Job-UUID ODER external_ref)
  const job = (body.job ?? {}) as { jobId?: string };
  let agencyId: string | null = null;
  if (job.jobId) {
    const query = isUuid(job.jobId)
      ? svc.from('jobs').select('agency_id').eq('id', job.jobId).single()
      : svc.from('jobs').select('agency_id').eq('external_ref', job.jobId).limit(1).single();
    const { data } = await query;
    agencyId = data?.agency_id ?? null;
  }

  const { error } = await svc.from('events_inbox').insert({
    source: 'indeed',
    external_id: applyId,
    agency_id: agencyId,
    payload: { type: 'ingest.indeed', body },
  });
  if (error) {
    if (error.code === '23505') {
      // Doppelte Zustellung — idempotent, keine zweite Bewerbung (Spec §5)
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error('[indeed-apply] events_inbox insert fehlgeschlagen', error.message);
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
