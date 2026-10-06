import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';
import { IMPERSONATION_COOKIE } from '@/lib/recruiting/scope';
import { darfKundenCloud } from '@/lib/kunden-cloud/zugriff';

const COOKIE_OPTS = {
  httpOnly: true,
  path: '/',
  sameSite: 'lax' as const,
  maxAge: 8 * 3600, // ein Arbeitstag im Innendienst
  secure: process.env.NODE_ENV === 'production',
};

function meta(request: NextRequest) {
  return {
    ip_address: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
    user_agent: request.headers.get('user-agent') ?? null,
  };
}

/** Cookie setzen + protokollieren. Liefert false, wenn es den Kunden nicht gibt. */
async function starte(request: NextRequest, userId: string, agencyId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: agency } = await admin.from('agencies').select('id').eq('id', agencyId).maybeSingle();
  if (!agency) return false;

  await logAudit(admin, {
    user_id: userId,
    agency_id: agencyId,
    entity_type: 'agency',
    entity_id: agencyId,
    action: 'impersonate',
    changes: [{ field: 'impersonation', old: null, new: 'start' }],
    ...meta(request),
  });

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, agencyId, COOKIE_OPTS);
  return true;
}

/** 1-Klick-Login als Link: /api/admin/impersonate?agency=<id>&ziel=/candidates */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!darfKundenCloud(user)) return NextResponse.redirect(new URL('/login', request.url));

  const agencyId = request.nextUrl.searchParams.get('agency') ?? '';
  if (!agencyId || !(await starte(request, user!.id, agencyId))) {
    return NextResponse.redirect(new URL('/innendienst', request.url));
  }
  const ziel = request.nextUrl.searchParams.get('ziel') ?? '/candidates';
  // nur interne Pfade zulassen
  return NextResponse.redirect(new URL(ziel.startsWith('/') && !ziel.startsWith('//') ? ziel : '/candidates', request.url));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!darfKundenCloud(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { agencyId } = (await request.json().catch(() => ({}))) as { agencyId?: unknown };
  if (typeof agencyId !== 'string' || !agencyId) {
    return NextResponse.json({ error: 'agencyId required' }, { status: 400 });
  }
  if (!(await starte(request, user!.id, agencyId))) return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!darfKundenCloud(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const cookieStore = await cookies();
  const agencyId = cookieStore.get(IMPERSONATION_COOKIE)?.value ?? null;

  await logAudit(createAdminClient(), {
    user_id: user!.id,
    agency_id: agencyId,
    entity_type: 'agency',
    entity_id: agencyId ?? 'unknown',
    action: 'impersonate',
    changes: [{ field: 'impersonation', old: 'active', new: 'end' }],
    ...meta(request),
  });

  cookieStore.delete(IMPERSONATION_COOKIE);
  return NextResponse.json({ ok: true, zurueck: user!.role === 'admin' ? '/admin/recruiting' : '/innendienst' });
}
