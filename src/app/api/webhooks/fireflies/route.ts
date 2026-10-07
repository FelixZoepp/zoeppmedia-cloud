import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verarbeiteGespraech } from '@/lib/gespraeche/analyse';
import { signaturOk } from '@/lib/gespraeche/signatur';

// Transkript laden + KI-Analyse + Close-Notiz laufen nach der Antwort weiter
export const maxDuration = 300;

/**
 * Fireflies-Webhook (V2: meeting.transcribed / meeting.summarized, V1: „Transcription completed“):
 * Gespräch analysieren und als Notiz an den passenden Close-Lead schreiben.
 */
export async function POST(req: NextRequest) {
  const roh = await req.text();
  const secret = process.env.FIREFLIES_WEBHOOK_SECRET;
  if (secret && !signaturOk(roh, req.headers.get('x-hub-signature'), secret)) {
    return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(roh);
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 });
  }
  const event = String(body.event ?? body.eventType ?? '');
  const id = String(body.meeting_id ?? body.meetingId ?? '');
  if (!id) return NextResponse.json({ ok: true, ignoriert: 'keine meeting_id' });
  // Erst nach der Zusammenfassung verarbeiten; „transcribed“ nur, falls „summarized“ nicht abonniert ist (Dublette wird übersprungen)
  if (!['meeting.summarized', 'meeting.transcribed', 'Transcription completed'].includes(event)) return NextResponse.json({ ok: true, ignoriert: event });

  after(() => verarbeiteGespraech(createAdminClient(), id).then(() => undefined));
  return NextResponse.json({ ok: true });
}
