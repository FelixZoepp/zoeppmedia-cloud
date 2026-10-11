import { NextRequest, NextResponse } from 'next/server';
import { secretFehlt, secretGleich } from '@/lib/security/webhook-secret';
import { svixGueltig } from '@/lib/security/svix';
import { createAdminClient } from '@/lib/supabase/admin';
import { verarbeiteIndeedMail } from '@/lib/indeed/mail-eingang';

export async function POST(request: NextRequest) {
  // Fail-closed: Resend-Signatur (RESEND_WEBHOOK_SECRET, empfohlen) oder Shared Secret (INDEED_WEBHOOK_SECRET).
  // Ohne beides wird nichts angenommen – sonst könnte jeder Bewerber mit fremden Nummern einschleusen.
  const roh = await request.text();
  const resendSecret = process.env.RESEND_WEBHOOK_SECRET;
  const webhookSecret = process.env.INDEED_WEBHOOK_SECRET;
  if (resendSecret) {
    if (!svixGueltig(resendSecret, request.headers, roh)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } else if (webhookSecret) {
    const provided = request.headers.get('x-webhook-secret') || request.nextUrl.searchParams.get('secret');
    if (!secretGleich(provided, webhookSecret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } else {
    return secretFehlt('RESEND_WEBHOOK_SECRET');
  }
  if (roh.length > 2_000_000) return NextResponse.json({ error: 'Zu groß' }, { status: 413 });

  const supabase = createAdminClient();
  try {
    const body = JSON.parse(roh) as Record<string, unknown>;
    const r = await verarbeiteIndeedMail(supabase, body);
    if (r.http >= 400) return NextResponse.json({ error: r.status }, { status: r.http });
    return NextResponse.json({ ok: true, status: r.status, candidate_id: r.candidateId ?? null });
  } catch (err) {
    try {
      await supabase.from('inbound_email_log').insert({
        from_address: 'unknown',
        to_address: 'unknown',
        subject: null,
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Unknown error',
      });
    } catch {
      // best-effort log
    }
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
