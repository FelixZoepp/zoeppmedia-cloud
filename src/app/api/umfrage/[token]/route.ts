import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { beantworteUmfrage } from '@/lib/surveys/versand';
import { checkRateLimit, clientIp } from '@/lib/security/rate-limit';

/** POST { antworten, kommentar? } – Antwort über den persönlichen Umfrage-Link (ohne Login) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const svc = createAdminClient();
  if (!(await checkRateLimit(svc, `umfrage:${clientIp(req.headers)}`, 20, 600))) {
    return NextResponse.json({ error: 'Zu viele Anfragen – bitte später erneut versuchen' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { antworten?: unknown; kommentar?: unknown } | null;
  if (!body) return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });

  const erg = await beantworteUmfrage(svc, token, body.antworten, body.kommentar);
  if (!erg.ok) return NextResponse.json({ error: erg.error }, { status: erg.status });
  return NextResponse.json({ ok: true });
}
