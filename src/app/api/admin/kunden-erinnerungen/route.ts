import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ERINNERUNG_AKTIV_KEY, erinnereKunden, erinnerungenAktiv, erinnerungsMail } from '@/lib/fulfillment/kunden-erinnerung';

/** GET – Schalter + wer heute erinnert würde; ?vorschau=<agency_id> liefert die Mail als HTML (intern) */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const svc = createAdminClient();
  const vorschau = req.nextUrl.searchParams.get('vorschau');
  if (vorschau) {
    const [x] = await erinnereKunden(svc, { nurId: vorschau, trocken: true });
    if (!x) return new NextResponse('Heute keine Erinnerung für diesen Kunden fällig.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    const mail = erinnerungsMail(null, x.aufgaben, `${req.nextUrl.origin}/deine-aufgaben`);
    return new NextResponse(`<!-- Betreff: ${mail.betreff} -->${mail.html}`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  const [aktiv, faellig] = await Promise.all([erinnerungenAktiv(svc), erinnereKunden(svc, { trocken: true })]);
  return NextResponse.json({ aktiv, darfSchalten: user.role === 'admin', faellig });
}

/** POST { aktiv } – Automatik an/aus (nur Admin) */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const { aktiv } = (await req.json().catch(() => ({}))) as { aktiv?: boolean };
  const { error } = await createAdminClient()
    .from('system_einstellungen')
    .upsert({ key: ERINNERUNG_AKTIV_KEY, wert: aktiv ? 'true' : 'false' }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ aktiv: !!aktiv });
}
