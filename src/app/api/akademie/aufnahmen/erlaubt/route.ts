import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';

/** PUT { userIds: string[] } – welche Mitarbeiter außer Admins SOPs aufnehmen dürfen (nur Admin) */
export async function PUT(req: NextRequest) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const body = (await req.json().catch(() => null)) as { userIds?: unknown } | null;
  if (!body || !Array.isArray(body.userIds)) return fehler('userIds erwartet');
  const ids = body.userIds.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x));
  const { data: gueltig } = await k.svc.from('users').select('id').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).eq('role', 'employee');
  const liste = ((gueltig ?? []) as Array<{ id: string }>).map((u) => u.id);
  await k.svc.from('system_einstellungen').upsert({ key: 'akademie_aufnahme_erlaubt', wert: liste.join(','), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return NextResponse.json({ erlaubt: liste });
}
