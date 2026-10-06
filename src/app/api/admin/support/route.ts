import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { agencyLogo } from '@/lib/branding/logo';
import { ANFRAGE_STATUS, ladeAnfragen, type AnfrageStatus } from '@/lib/support/anfragen';

/** GET: alle Kunden-Anfragen (intern) · PATCH { id, status, antwort }: bearbeiten */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const svc = createAdminClient();
  try {
    const anfragen = await ladeAnfragen(svc, { status: req.nextUrl.searchParams.get('status') ?? undefined });
    const agencyIds = [...new Set(anfragen.map((a) => a.agency_id))];
    const userIds = [...new Set(anfragen.flatMap((a) => [a.user_id, a.bearbeitet_von]).filter((x): x is string => !!x))];
    const [{ data: ags }, { data: users }] = await Promise.all([
      agencyIds.length ? svc.from('agencies').select('id, name, settings').in('id', agencyIds) : Promise.resolve({ data: [] }),
      userIds.length ? svc.from('users').select('id, name').in('id', userIds) : Promise.resolve({ data: [] }),
    ]);
    const agMap = new Map(((ags ?? []) as Array<{ id: string; name: string; settings: unknown }>).map((a) => [a.id, a]));
    const userMap = new Map(((users ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name]));
    return NextResponse.json(
      anfragen.map((a) => ({
        ...a,
        kunde: agMap.get(a.agency_id)?.name ?? 'Kunde',
        logo_url: agencyLogo(agMap.get(a.agency_id)?.settings),
        von: a.user_id ? userMap.get(a.user_id) ?? null : null,
        bearbeiter: a.bearbeitet_von ? userMap.get(a.bearbeitet_von) ?? null : null,
      })),
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; status?: unknown; antwort?: unknown };
  if (typeof body.id !== 'string' || !body.id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), bearbeitet_von: user.id };
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !ANFRAGE_STATUS.includes(body.status as AnfrageStatus)) {
      return NextResponse.json({ error: 'Unbekannter Status' }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (body.antwort !== undefined) {
    if (body.antwort !== null && typeof body.antwort !== 'string') return NextResponse.json({ error: 'Antwort ungültig' }, { status: 400 });
    patch.antwort = typeof body.antwort === 'string' && body.antwort.trim() ? body.antwort.trim().slice(0, 4000) : null;
  }
  const { data, error } = await createAdminClient().from('support_anfragen').update(patch).eq('id', body.id).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Anfrage nicht gefunden' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
