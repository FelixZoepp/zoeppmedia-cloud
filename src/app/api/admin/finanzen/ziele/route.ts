import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { liesZiele, ZIELE_KEY } from '@/lib/finanzen/ziele';

/** Masterplan-Ziele im Cash-Plan (nur Admins) */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const svc = createAdminClient();
  const [{ data }, { data: kunden }] = await Promise.all([
    svc.from('system_einstellungen').select('wert').eq('key', ZIELE_KEY).maybeSingle(),
    svc.from('finanz_kunden_status').select('upsell, rueckgewinnung').eq('segment', 'd2d'),
  ]);
  // Bewertete Direktvertriebskunden (Angabe Felix) – genauer als die Schätzung aus den Lexware-Beträgen
  const bewertet = (kunden ?? []).filter((k) => k.upsell != null);
  const historie = bewertet.length
    ? { kunden: bewertet.length, upsell: bewertet.filter((k) => k.upsell).length, rueckgewinnung: (kunden ?? []).filter((k) => k.rueckgewinnung).length }
    : null;
  return NextResponse.json({ ziele: liesZiele(data?.wert ?? null), historie });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const ziele = liesZiele(await req.json().catch(() => null));
  const { error } = await createAdminClient().from('system_einstellungen').upsert({ key: ZIELE_KEY, wert: JSON.stringify(ziele) }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ziele });
}
