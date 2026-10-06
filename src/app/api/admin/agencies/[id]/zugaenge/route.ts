import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { KUNDEN_ROLLEN, type KundenRolle } from '@/lib/agency-team/access';
import { appUrl, sendeEinladung } from '@/lib/agency-team/einladung';

type Ctx = { params: Promise<{ id: string }> };

/** GET – Logins und offene Einladungen eines Kunden (intern) */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const svc = createAdminClient();
  const [{ data: users }, { data: einladungen }] = await Promise.all([
    svc.from('users').select('id, name, email, role, last_login').eq('agency_id', id).order('name'),
    svc.from('invite_tokens').select('id, email, name, role, expires_at, email_sent_at').eq('agency_id', id).eq('redeemed', false).order('created_at', { ascending: false }),
  ]);
  return NextResponse.json({ users: users ?? [], einladungen: einladungen ?? [] });
}

/** POST { email, name?, role } – Kunden-Login einladen (intern) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; role?: string };
  const email = body.email?.trim().toLowerCase() ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, { status: 400 });
  const role = (KUNDEN_ROLLEN as readonly string[]).includes(body.role ?? '') ? (body.role as KundenRolle) : 'agency_owner';

  const svc = createAdminClient();
  const { data: vorhanden } = await svc.from('users').select('id').ilike('email', email).maybeSingle();
  if (vorhanden) return NextResponse.json({ error: 'Für diese E-Mail gibt es schon einen Zugang.' }, { status: 409 });

  const { data: invite, error } = await svc
    .from('invite_tokens')
    .insert({ agency_id: id, email, name: body.name?.trim() || null, role, invited_by: user.id })
    .select('id, token, expires_at')
    .single();
  if (error || !invite) return NextResponse.json({ error: 'Einladung konnte nicht erstellt werden.' }, { status: 500 });
  const versendet = await sendeEinladung(svc, id, { id: invite.id, token: invite.token, expires_at: invite.expires_at, email });
  return NextResponse.json({ ok: true, versendet, link: `${appUrl()}/register/${invite.token}` }, { status: 201 });
}
