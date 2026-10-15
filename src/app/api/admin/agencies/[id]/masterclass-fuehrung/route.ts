import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { bereichVon, fuehrungSchemaReady } from '@/lib/masterclass/bereich';

type Ctx = { params: Promise<{ id: string }> };

/** GET – Logins des Kunden mit Freischaltung + Fortschritt in der Führungskräfte-Masterclass (intern) */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const svc = createAdminClient();
  if (!(await fuehrungSchemaReady(svc))) return NextResponse.json({ ready: false, users: [], lektionen: 0 });

  const [{ data: users }, { data: frei }, { data: mods }, { data: lessons }, { data: anfrage }] = await Promise.all([
    svc.from('users').select('id, name, email, role').eq('agency_id', id).order('name'),
    svc.from('masterclass_freischaltungen').select('user_id, created_at').eq('agency_id', id),
    svc.from('masterclass_modules').select('*').eq('published', true),
    svc.from('masterclass_lessons').select('*'),
    svc.from('activity_log').select('created_at').eq('agency_id', id).eq('metadata->>kind', 'masterclass_fuehrung_anfrage').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const fuehrungMods = new Set(((mods ?? []) as Array<{ id: string; bereich?: unknown }>).filter((m) => bereichVon(m) === 'fuehrung').map((m) => m.id));
  const lektionIds = ((lessons ?? []) as Array<{ id: string; module_id: string; status?: string }>).filter((l) => fuehrungMods.has(l.module_id) && l.status !== 'entwurf').map((l) => l.id);
  const userIds = ((users ?? []) as Array<{ id: string }>).map((u) => u.id);
  const { data: prog } = userIds.length && lektionIds.length
    ? await svc.from('masterclass_user_progress').select('user_id, lesson_id').in('user_id', userIds).in('lesson_id', lektionIds).eq('watched', true)
    : { data: [] };
  const fertig = new Map<string, number>();
  for (const p of (prog ?? []) as Array<{ user_id: string }>) fertig.set(p.user_id, (fertig.get(p.user_id) ?? 0) + 1);
  const seit = new Map(((frei ?? []) as Array<{ user_id: string; created_at: string }>).map((f) => [f.user_id, f.created_at]));

  return NextResponse.json({
    ready: true,
    lektionen: lektionIds.length,
    anfrage_am: (anfrage as { created_at: string } | null)?.created_at ?? null,
    users: ((users ?? []) as Array<{ id: string; name: string; email: string; role: string }>).map((u) => ({
      ...u,
      freigeschaltet_seit: seit.get(u.id) ?? null,
      erledigt: fertig.get(u.id) ?? 0,
    })),
  });
}

/** POST { user_id, an } – Führungskräfte-Masterclass für eine Person frei- oder wegschalten (nur Admin) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur Admins können freischalten' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { user_id?: string; an?: boolean };
  if (typeof body.user_id !== 'string' || typeof body.an !== 'boolean') return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 });
  const svc = createAdminClient();
  if (!(await fuehrungSchemaReady(svc))) return NextResponse.json({ error: 'Datenbank-Änderung für die Führungskräfte-Masterclass fehlt noch' }, { status: 503 });

  // Nur Logins dieses Kunden
  const { data: ziel } = await svc.from('users').select('id, name').eq('id', body.user_id).eq('agency_id', id).maybeSingle();
  if (!ziel) return NextResponse.json({ error: 'Login gehört nicht zu diesem Kunden' }, { status: 404 });

  const { error } = body.an
    ? await svc.from('masterclass_freischaltungen').upsert({ user_id: body.user_id, agency_id: id, freigeschaltet_von: user.id }, { onConflict: 'user_id' })
    : await svc.from('masterclass_freischaltungen').delete().eq('user_id', body.user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
