import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { KUNDEN_CLOUD_BEREICHE } from '@/lib/team/funktionen';
import { darfTeamVerwalten, requireTeamScope, vergebbareRollen, type KundenRolle } from '@/lib/agency-team/access';
import { appUrl, sendeEinladung } from '@/lib/agency-team/einladung';

/**
 * GET /api/agency-team – Nutzer + offene Einladungen der Kunden-Cloud.
 * `zuweisbar`: wem Bewerber zugewiesen werden können (Kunden-Team mit Schreibrecht + interner Innendienst).
 */
export async function GET() {
  const scope = await requireTeamScope(false);
  if (scope instanceof NextResponse) return scope;
  const svc = createAdminClient();

  const [{ data: users }, { data: einladungen }, { data: innendienst }] = await Promise.all([
    svc.from('users').select('id, name, email, role, last_login, avatar_url').eq('agency_id', scope.agencyId).order('name'),
    svc
      .from('invite_tokens')
      .select('id, email, name, role, expires_at, email_sent_at, created_at')
      .eq('agency_id', scope.agencyId)
      .eq('redeemed', false)
      .order('created_at', { ascending: false }),
    svc.from('users').select('id, name').eq('role', 'employee').in('funktion', [...KUNDEN_CLOUD_BEREICHE]).neq('aktiv', false),
  ]);

  const team = (users ?? []) as Array<{ id: string; name: string; role: string }>;
  return NextResponse.json({
    ich: scope.user.id,
    kannVerwalten: darfTeamVerwalten(scope.user),
    rollen: vergebbareRollen(scope.user),
    users: team,
    einladungen: einladungen ?? [],
    zuweisbar: [
      ...team.filter((u) => u.role !== 'agency_viewer').map((u) => ({ user_id: u.id, name: u.name })),
      ...((innendienst ?? []) as Array<{ id: string; name: string }>).map((u) => ({ user_id: u.id, name: `${u.name} (Innendienst)` })),
    ],
  });
}

/** POST /api/agency-team – Kollegen einladen { email, name?, role } */
export async function POST(req: NextRequest) {
  const scope = await requireTeamScope(true);
  if (scope instanceof NextResponse) return scope;

  const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; role?: string };
  const email = body.email?.trim().toLowerCase() ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, { status: 400 });
  const role = (body.role ?? 'agency_member') as KundenRolle;
  if (!vergebbareRollen(scope.user).includes(role)) return NextResponse.json({ error: 'Diese Rolle kannst du nicht vergeben.' }, { status: 403 });

  const svc = createAdminClient();
  const { data: vorhanden } = await svc.from('users').select('id').ilike('email', email).maybeSingle();
  if (vorhanden) return NextResponse.json({ error: 'Für diese E-Mail gibt es schon einen Zugang.' }, { status: 409 });

  const { data: invite, error } = await svc
    .from('invite_tokens')
    .insert({ agency_id: scope.agencyId, email, name: body.name?.trim() || null, role, invited_by: scope.user.id })
    .select('id, token, expires_at')
    .single();
  if (error || !invite) return NextResponse.json({ error: 'Einladung konnte nicht erstellt werden.' }, { status: 500 });

  const versendet = await sendeEinladung(svc, scope.agencyId, { id: invite.id, token: invite.token, expires_at: invite.expires_at, email });
  return NextResponse.json({ ok: true, versendet, link: `${appUrl()}/register/${invite.token}` }, { status: 201 });
}
