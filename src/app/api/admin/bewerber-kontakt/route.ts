import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { KONTAKT_KEY, ladeSchalter } from '@/lib/recruiting/kontakt-schalter';

/** GET – Schalter „Bewerber-Kontakt“ (nur Admins) */
export async function GET() {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  return NextResponse.json(await ladeSchalter(createAdminClient()));
}

/** PUT { aktiv?, testnummern?, testmails? } */
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const svc = createAdminClient();
  const alt = await ladeSchalter(svc);
  const b = (await req.json().catch(() => ({}))) as { aktiv?: boolean; testnummern?: string[]; testmails?: string[] };
  const liste = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 3).map((x) => x.trim()).slice(0, max) : null);
  const neu = {
    aktiv: typeof b.aktiv === 'boolean' ? b.aktiv : alt.aktiv,
    testnummern: liste(b.testnummern, 20) ?? alt.testnummern,
    testmails: liste(b.testmails, 20) ?? alt.testmails,
  };
  const { error } = await svc.from('system_einstellungen').upsert({ key: KONTAKT_KEY, wert: JSON.stringify(neu), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await svc.from('audit_log').insert({ actor_id: user.id, agency_id: null, action: 'bewerber_kontakt.geaendert', target: KONTAKT_KEY, data: neu });
  return NextResponse.json(neu);
}
