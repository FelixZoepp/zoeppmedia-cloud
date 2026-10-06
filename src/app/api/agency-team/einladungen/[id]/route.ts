import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireTeamScope } from '@/lib/agency-team/access';
import { sendeEinladung } from '@/lib/agency-team/einladung';

type Ctx = { params: Promise<{ id: string }> };

/** POST – Einladung erneut senden (Gültigkeit wieder 7 Tage) */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const scope = await requireTeamScope(true);
  if (scope instanceof NextResponse) return scope;
  const { id } = await params;
  const svc = createAdminClient();
  const { data: invite } = await svc
    .from('invite_tokens')
    .update({ expires_at: new Date(Date.now() + 7 * 864e5).toISOString() })
    .eq('id', id)
    .eq('agency_id', scope.agencyId)
    .eq('redeemed', false)
    .select('id, token, expires_at, email')
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: 'Einladung nicht gefunden' }, { status: 404 });
  const versendet = await sendeEinladung(svc, scope.agencyId, invite as { id: string; token: string; expires_at: string; email: string });
  return NextResponse.json({ ok: true, versendet });
}

/** DELETE – Einladung zurückziehen */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const scope = await requireTeamScope(true);
  if (scope instanceof NextResponse) return scope;
  const { id } = await params;
  const { error } = await createAdminClient().from('invite_tokens').delete().eq('id', id).eq('agency_id', scope.agencyId).eq('redeemed', false);
  if (error) return NextResponse.json({ error: 'Konnte nicht gelöscht werden' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
