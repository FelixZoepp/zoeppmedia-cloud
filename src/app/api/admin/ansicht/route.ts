import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { IMPERSONATION_COOKIE } from '@/lib/recruiting/scope';
import { ANSICHT_COOKIE, ANSICHTEN, istAnsicht } from '@/lib/ansicht';
import { logAudit } from '@/lib/audit/log';

const OPTS = { httpOnly: true, path: '/', sameSite: 'lax' as const, maxAge: 8 * 3600, secure: process.env.NODE_ENV === 'production' };

/** POST { ansicht, agencyId? }: Demo-Ansicht starten (bei „kunde“ mit Kunden-Cloud) · DELETE: beenden */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const { ansicht, agencyId } = (await req.json().catch(() => ({}))) as { ansicht?: string; agencyId?: string };
  if (!istAnsicht(ansicht)) return NextResponse.json({ error: 'Unbekannte Ansicht' }, { status: 400 });

  const jar = await cookies();
  if (ansicht === 'kunde') {
    if (!agencyId) return NextResponse.json({ error: 'Bitte einen Kunden wählen' }, { status: 400 });
    const { data } = await createAdminClient().from('agencies').select('id').eq('id', agencyId).maybeSingle();
    if (!data) return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
    jar.set(IMPERSONATION_COOKIE, agencyId, OPTS);
  } else {
    jar.delete(IMPERSONATION_COOKIE);
  }
  jar.set(ANSICHT_COOKIE, ansicht, OPTS);
  await logAudit(createAdminClient(), {
    user_id: user.id,
    agency_id: ansicht === 'kunde' ? agencyId! : null,
    entity_type: 'agency',
    entity_id: ansicht === 'kunde' ? agencyId! : 'ansicht',
    action: 'impersonate',
    changes: [{ field: 'demo_ansicht', old: null, new: ansicht }],
    ip_address: req.headers.get('x-forwarded-for') ?? null,
    user_agent: req.headers.get('user-agent') ?? null,
  }).catch(() => {});
  return NextResponse.json({ ok: true, start: ANSICHTEN[ansicht].start });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const jar = await cookies();
  const warKunde = jar.get(ANSICHT_COOKIE)?.value === 'kunde';
  jar.delete(ANSICHT_COOKIE);
  if (warKunde) jar.delete(IMPERSONATION_COOKIE);
  return NextResponse.json({ ok: true, start: '/admin' });
}
