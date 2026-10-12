import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { FREIGABEN, ladeFreigaben, setzeFreigabe, type FreigabeKey } from '@/lib/freigaben';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  return NextResponse.json({ freigaben: FREIGABEN, an: await ladeFreigaben(createAdminClient()) });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { key?: string; an?: boolean };
  if (!b.key || !(b.key in FREIGABEN) || typeof b.an !== 'boolean') return NextResponse.json({ error: 'Ungültig' }, { status: 400 });
  const svc = createAdminClient();
  await setzeFreigabe(svc, b.key as FreigabeKey, b.an);
  await svc.from('audit_log').insert({ actor_id: user.id, agency_id: null, action: `freigabe.${b.an ? 'an' : 'aus'}`, target: b.key, data: { an: b.an } }).then(() => {}, () => {});
  return NextResponse.json({ ok: true });
}
