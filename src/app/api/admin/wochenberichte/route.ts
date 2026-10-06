import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeBerichtKunden } from '@/lib/wochenbericht/laden';
import { automatikAktiv, sendeWochenberichte, setzeAutomatik } from '@/lib/wochenbericht/versand';

export const maxDuration = 300;

/** GET – Kunden mit letztem Wochenbericht + Schalter der Automatik (intern) */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const svc = createAdminClient();
  const [kunden, aktiv, { data: berichte }] = await Promise.all([
    ladeBerichtKunden(svc),
    automatikAktiv(svc),
    svc.from('wochenberichte').select('agency_id, jahr, kw, status, gesendet_am, fehler').order('jahr', { ascending: false }).order('kw', { ascending: false }).limit(2000),
  ]);
  const letzter = new Map<string, unknown>();
  for (const b of (berichte ?? []) as Array<{ agency_id: string }>) if (!letzter.has(b.agency_id)) letzter.set(b.agency_id, b);
  return NextResponse.json({
    aktiv,
    darfSenden: user.role === 'admin',
    kunden: kunden.map((k) => ({ ...k, letzter: letzter.get(k.id) ?? null })),
  });
}

/** POST { aktion: 'automatik', aktiv } | { aktion: 'senden', agency_id?, erneut? } – nur Admin */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { aktion?: string; aktiv?: boolean; agency_id?: string; erneut?: boolean };
  const svc = createAdminClient();
  if (body.aktion === 'automatik') {
    await setzeAutomatik(svc, !!body.aktiv);
    return NextResponse.json({ aktiv: !!body.aktiv });
  }
  if (body.aktion === 'senden') {
    const ergebnis = await sendeWochenberichte(svc, { nurId: body.agency_id, erneut: !!body.erneut, cloudUrl: new URL(req.url).origin });
    return NextResponse.json({ ergebnis });
  }
  return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
}
