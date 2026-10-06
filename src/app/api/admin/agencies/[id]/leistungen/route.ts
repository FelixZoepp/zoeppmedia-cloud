import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { aendereBausteine } from '@/lib/fulfillment/engine';
import { bausteineBereinigen, bausteineVon } from '@/lib/fulfillment/pakete';
import { logActivity } from '@/lib/activity/log';

type Ctx = { params: Promise<{ id: string }> };

/** GET – Paket und gebuchte Leistungen eines Kunden (intern) */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const { data } = await createAdminClient().from('agencies').select('paket, bausteine').eq('id', id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
  const a = data as { paket: string | null; bausteine: unknown };
  return NextResponse.json({ paket: a.paket, bausteine: bausteineVon(a.bausteine), gesetzt: Array.isArray(a.bausteine), darfAendern: user.role === 'admin' });
}

/** PATCH { bausteine } – Leistungen ändern (Admin): Schritte werden nachgetragen bzw. entfallen */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur Admins können Leistungen ändern' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { bausteine?: unknown };
  const bausteine = bausteineBereinigen(body.bausteine);
  if (!bausteine) return NextResponse.json({ error: 'Bitte mindestens eine Leistung auswählen.' }, { status: 400 });

  const svc = createAdminClient();
  try {
    const ergebnis = await aendereBausteine(svc, id, bausteine, user.id);
    await logActivity(svc, {
      agency_id: id,
      user_id: user.id,
      action: `Leistungen geändert: ${bausteine.join(', ')}`,
      action_type: 'leistungen',
      metadata: { bausteine, ...ergebnis },
    }).catch(() => {});
    return NextResponse.json({ bausteine, ...ergebnis });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}
