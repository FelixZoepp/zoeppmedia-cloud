import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin';
import { logAudit } from '@/lib/audit/log';
import { IMPERSONATION_COOKIE } from '@/lib/recruiting/scope';

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { agencyId } = body as { agencyId?: unknown };

  if (typeof agencyId !== 'string' || !agencyId) {
    return NextResponse.json({ error: 'agencyId required' }, { status: 400 });
  }

  // Verify agency exists
  const admin = createAdminClient();
  const { data: agency } = await admin
    .from('agencies')
    .select('id')
    .eq('id', agencyId)
    .single();

  if (!agency) {
    return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
  }

  // Get current user for audit
  const { data: { user } } = await supabase.auth.getUser();

  await logAudit(admin, {
    user_id: user?.id ?? null,
    agency_id: agencyId,
    entity_type: 'agency',
    entity_id: agencyId,
    action: 'impersonate',
    changes: [{ field: 'impersonation', old: null, new: 'start' }],
    ip_address: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
    user_agent: request.headers.get('user-agent') ?? null,
  });

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, agencyId, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 3600,
    secure: process.env.NODE_ENV === 'production',
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createServerClient();

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cookieStore = await cookies();
  const agencyId = cookieStore.get(IMPERSONATION_COOKIE)?.value ?? null;

  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  await logAudit(admin, {
    user_id: user?.id ?? null,
    agency_id: agencyId,
    entity_type: 'agency',
    entity_id: agencyId ?? 'unknown',
    action: 'impersonate',
    changes: [{ field: 'impersonation', old: 'active', new: 'end' }],
    ip_address: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
    user_agent: request.headers.get('user-agent') ?? null,
  });

  cookieStore.delete(IMPERSONATION_COOKIE);

  return NextResponse.json({ ok: true });
}
