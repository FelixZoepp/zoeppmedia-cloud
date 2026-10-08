import { NextRequest, NextResponse } from 'next/server';
import { isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireTeamScope, vergebbareRollen, type KundenRolle } from '@/lib/agency-team/access';

type Ctx = { params: Promise<{ userId: string }> };

/** Nutzer dieser Kunden-Cloud laden – Inhaber kann nur Mitarbeiter/Lesen-Zugänge ändern, nie sich selbst. */
async function ziel(userId: string, agencyId: string, ich: string, intern: boolean) {
  if (userId === ich) return { fehler: 'Den eigenen Zugang kannst du hier nicht ändern.' };
  const { data } = await createAdminClient().from('users').select('id, role').eq('id', userId).eq('agency_id', agencyId).maybeSingle();
  const u = data as { id: string; role: string } | null;
  if (!u) return { fehler: 'Nutzer nicht gefunden' };
  if (u.role === 'agency_owner' && !intern) return { fehler: 'Inhaber-Zugänge kann nur Zoepp Media ändern.' };
  return { u };
}

/** PATCH { role } – Rolle ändern */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const scope = await requireTeamScope(true);
  if (scope instanceof NextResponse) return scope;
  const { userId } = await params;
  const { role } = (await req.json().catch(() => ({}))) as { role?: KundenRolle };
  if (!role || !vergebbareRollen(scope.user).includes(role)) return NextResponse.json({ error: 'Diese Rolle kannst du nicht vergeben.' }, { status: 403 });
  const r = await ziel(userId, scope.agencyId, scope.user.id, isInternal(scope.user.role));
  if ('fehler' in r) return NextResponse.json({ error: r.fehler }, { status: 403 });
  const { error } = await createAdminClient().from('users').update({ role }).eq('id', userId);
  if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE – Zugang entfernen (Login wird gelöscht, Bewerber und Verlauf bleiben erhalten) */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const scope = await requireTeamScope(true);
  if (scope instanceof NextResponse) return scope;
  const { userId } = await params;
  const r = await ziel(userId, scope.agencyId, scope.user.id, isInternal(scope.user.role));
  if ('fehler' in r) return NextResponse.json({ error: r.fehler }, { status: 403 });
  const svc = createAdminClient();
  const { error } = await svc.auth.admin.deleteUser(userId);
  if (error) {
    // Fallback: Zugang wenigstens sperren – Login bannen (beendet auch laufende Sitzungen beim nächsten Token-Refresh)
    // und aktiv=false, das getCurrentUser und die RLS-Helfer sofort auswerten
    await svc.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
    await svc.from('users').update({ aktiv: false }).eq('id', userId);
    return NextResponse.json({ error: 'Login konnte nicht gelöscht werden – Zugang wurde deaktiviert.' }, { status: 500 });
  }
  await svc.from('users').delete().eq('id', userId);
  return NextResponse.json({ ok: true });
}
