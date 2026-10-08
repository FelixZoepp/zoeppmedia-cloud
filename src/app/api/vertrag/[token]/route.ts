import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bestaetigeVertrag } from '@/lib/vertrag/bestaetigen';
import { checkRateLimit, clientIp } from '@/lib/security/rate-limit';

/** POST { name, akzeptiert } – Kunde bestätigt den Vertrag über den persönlichen Link (ohne Login) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const svc = createAdminClient();
  const ip = clientIp(req.headers);
  if (!(await checkRateLimit(svc, `vertrag:${ip}`, 10, 600))) {
    return NextResponse.json({ error: 'Zu viele Anfragen – bitte später erneut versuchen' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { name?: unknown; akzeptiert?: unknown } | null;
  if (!body) return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });

  try {
    const erg = await bestaetigeVertrag(svc, token, {
      name: typeof body.name === 'string' ? body.name : '',
      akzeptiert: body.akzeptiert === true,
      ip,
      userAgent: req.headers.get('user-agent') ?? '',
    });
    if (erg.status === 'nicht_gefunden') return NextResponse.json({ error: 'Link ungültig' }, { status: 404 });
    if (erg.status === 'ungueltig') return NextResponse.json({ error: erg.fehler }, { status: 400 });
    return NextResponse.json(erg);
  } catch (err) {
    console.error('[vertrag] Bestätigung fehlgeschlagen:', err);
    return NextResponse.json({ error: 'Bestätigung fehlgeschlagen – bitte erneut versuchen' }, { status: 500 });
  }
}
