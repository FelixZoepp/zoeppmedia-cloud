import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeWochenbericht } from '@/lib/wochenbericht/laden';
import { wochenberichtHtml } from '@/lib/wochenbericht/email';

export const maxDuration = 60;

/** GET ?agency=<id> – E-Mail-Vorschau des Wochenberichts mit dem aktuellen Stand (intern) */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const agency = req.nextUrl.searchParams.get('agency');
  if (!agency) return NextResponse.json({ error: 'agency fehlt' }, { status: 400 });
  const bericht = await ladeWochenbericht(createAdminClient(), agency);
  if (!bericht) return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
  return new NextResponse(wochenberichtHtml(bericht, `${req.nextUrl.origin}/reports`), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
