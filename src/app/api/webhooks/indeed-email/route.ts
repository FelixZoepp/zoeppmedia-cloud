import { NextRequest, NextResponse } from 'next/server';
import { secretGleich } from '@/lib/security/webhook-secret';
import { createAdminClient } from '@/lib/supabase/admin';
import { verarbeiteIndeedMail } from '@/lib/indeed/mail-eingang';

export async function POST(request: NextRequest) {
  // Shared-Secret-Prüfung: aktiv sobald INDEED_WEBHOOK_SECRET gesetzt ist (live noch nicht gesetzt).
  // Der E-Mail-Forwarder muss das Secret als Header x-webhook-secret oder ?secret= mitschicken.
  const webhookSecret = process.env.INDEED_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // TODO: Secret beim Absender und in Vercel setzen, dann hier fail-closed (secretFehlt)
    console.warn('[webhook] INDEED_WEBHOOK_SECRET ist nicht gesetzt – Anfrage ungeprüft angenommen');
  } else {
    // Header bevorzugt; ?secret= bleibt für bestehende Forwarder-Konfigurationen erlaubt
    const provided =
      request.headers.get('x-webhook-secret') ||
      request.nextUrl.searchParams.get('secret');
    if (!secretGleich(provided, webhookSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  try {
    const body = (await request.json()) as Record<string, unknown>;
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
