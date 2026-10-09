import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { ladeTeam, stelleBoardsSicher } from '@/lib/aufgaben/boards';

/** GET – Boards (persönliche werden sichergestellt), Team, offene + kürzlich erledigte Aufgaben, Serien */
export async function GET() {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const svc = createAdminClient();
  const team = await ladeTeam(svc);
  const boards = await stelleBoardsSicher(svc, team);
  const seit = new Date(Date.now() - 14 * 864e5).toISOString();
  const [{ data: offen }, { data: erledigt }, { data: serien }] = await Promise.all([
    svc
      .from('internal_tasks')
      .select('id, title, description, assigned_to, board_id, status, priority, due_date, quelle, serie_id, position, agency_id, created_by, created_at, erledigt_am, agencies(name)')
      .neq('status', 'done')
      .order('position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(2000),
    svc
      .from('internal_tasks')
      .select('id, title, description, assigned_to, board_id, status, priority, due_date, quelle, serie_id, position, agency_id, created_by, created_at, erledigt_am, agencies(name)')
      .eq('status', 'done')
      .or(`erledigt_am.gte.${seit},and(erledigt_am.is.null,updated_at.gte.${seit})`)
      .order('erledigt_am', { ascending: false, nullsFirst: false })
      .limit(500),
    svc.from('aufgaben_serien').select('*').order('created_at', { ascending: false }),
  ]);
  return NextResponse.json({
    ich: { id: user.id, name: user.name, role: user.role },
    team: team.map(({ phone: _p, ...t }) => (void _p, t)),
    boards,
    aufgaben: [...(offen ?? []), ...(erledigt ?? [])],
    serien: serien ?? [],
  });
}

/** POST { name, beschreibung? } – Team-Board anlegen */
export async function POST(req: NextRequest) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { name?: string; beschreibung?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'Name fehlt' }, { status: 400 });
  const { data, error } = await createAdminClient()
    .from('aufgaben_boards')
    .insert({ name: name.slice(0, 80), beschreibung: body.beschreibung?.slice(0, 300) || null, created_by: user.id, sortierung: 100 })
    .select('id, name, besitzer_id, beschreibung, farbe, sortierung')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
