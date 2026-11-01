import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { FREIGABEN, ladeFreigaben, setzeFreigabe, type FreigabeKey } from '@/lib/freigaben';
import { auditEreignis } from '@/lib/audit/log';

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
  await auditEreignis({ userId: user.id, agencyId: null, entityType: 'settings', action: 'update', ereignis: `freigabe.${b.an ? 'an' : 'aus'}`, ziel: b.key, daten: { an: b.an } });
  return NextResponse.json({ ok: true });
}
