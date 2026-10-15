import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { KONTAKT_KEY, ladeSchalter, setzeKunde } from '@/lib/recruiting/kontakt-schalter';

/** GET – Schalter „Bewerber-Kontakt“ (nur Admins) */
export async function GET() {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  return NextResponse.json(await ladeSchalter(createAdminClient()));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PUT { aktiv?, testnummern?, testmails?, kunde?: { id, an } } – `kunde` schaltet den Kontakt für genau einen Kunden */
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const svc = createAdminClient();
  const alt = await ladeSchalter(svc);
  const b = (await req.json().catch(() => ({}))) as { aktiv?: boolean; testnummern?: string[]; testmails?: string[]; kunde?: { id?: unknown; an?: unknown } };
  const liste = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 3).map((x) => x.trim()).slice(0, max) : null);
  let neu = {
    aktiv: typeof b.aktiv === 'boolean' ? b.aktiv : alt.aktiv,
    testnummern: liste(b.testnummern, 20) ?? alt.testnummern,
    testmails: liste(b.testmails, 20) ?? alt.testmails,
    kunden: alt.kunden,
  };
  let kundeId: string | null = null;
  if (b.kunde !== undefined) {
    const id = typeof b.kunde?.id === 'string' ? b.kunde.id : '';
    if (!UUID.test(id) || typeof b.kunde?.an !== 'boolean') return NextResponse.json({ error: 'kunde: { id, an } erwartet' }, { status: 400 });
    const { data: ag } = await svc.from('agencies').select('id').eq('id', id).maybeSingle();
    if (!ag) return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
    neu = setzeKunde(neu, id, b.kunde.an);
    kundeId = id;
  }
  const { error } = await svc.from('system_einstellungen').upsert({ key: KONTAKT_KEY, wert: JSON.stringify(neu), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await svc.from('audit_log').insert(
    kundeId
      ? { actor_id: user.id, agency_id: kundeId, action: 'bewerber_kontakt.kunde_geaendert', target: KONTAKT_KEY, data: { kunde: kundeId, an: neu.kunden.includes(kundeId) } }
      : { actor_id: user.id, agency_id: null, action: 'bewerber_kontakt.geaendert', target: KONTAKT_KEY, data: neu },
  );
  return NextResponse.json(neu);
}
