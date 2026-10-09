import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { darfAufgabeSehen, darfBoardSehen, ladeTeam, stelleBoardsSicher } from '@/lib/aufgaben/boards';

/** GET – Boards (persönliche werden sichergestellt), Team, offene + kürzlich erledigte Aufgaben, Serien */
export async function GET() {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const svc = createAdminClient();
  const team = await ladeTeam(svc);
  let boards;
  try {
    boards = await stelleBoardsSicher(svc, team);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Boards nicht ladbar' }, { status: 500 });
  }
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
  const alleAufgaben = [...(offen ?? []), ...(erledigt ?? [])] as Array<{ id: string }>;
  const ids = alleAufgaben.map((a) => a.id);
  // In Portionen laden (URL-Länge bei vielen IDs)
  const checks: Array<{ task_id: string; erledigt: boolean }> = [];
  const komm: Array<{ task_id: string }> = [];
  for (let i = 0; i < ids.length; i += 200) {
    const teil = ids.slice(i, i + 200);
    const [c, k] = await Promise.all([
      svc.from('aufgaben_checkliste').select('task_id, erledigt').in('task_id', teil),
      svc.from('task_comments').select('task_id').in('task_id', teil),
    ]);
    checks.push(...((c.data ?? []) as typeof checks));
    komm.push(...((k.data ?? []) as typeof komm));
  }
  const zaehler = new Map<string, { check_gesamt: number; check_erledigt: number; kommentare: number }>();
  const z = (id: string) => zaehler.get(id) ?? (zaehler.set(id, { check_gesamt: 0, check_erledigt: 0, kommentare: 0 }), zaehler.get(id)!);
  for (const c of checks) {
    z(c.task_id).check_gesamt++;
    if (c.erledigt) z(c.task_id).check_erledigt++;
  }
  for (const k of komm) z(k.task_id).kommentare++;
  const ich = { id: user.id, role: user.role };
  const boardMap = new Map(boards.map((b) => [b.id, b]));
  type Zeile = { board_id: string | null; assigned_to: string | null; created_by: string | null };
  return NextResponse.json({
    ich: { id: user.id, name: user.name, role: user.role },
    team: team.map(({ phone: _p, ...t }) => (void _p, t)),
    boards: boards.filter((b) => darfBoardSehen(b, ich) && !(b as { archiviert?: boolean }).archiviert),
    archiviert: boards.filter((b) => !b.besitzer_id && (b as { archiviert?: boolean }).archiviert),
    aufgaben: alleAufgaben
      .filter((a) => darfAufgabeSehen(a as unknown as Zeile, boardMap, ich))
      .map((a) => ({ ...a, ...(zaehler.get(a.id) ?? { check_gesamt: 0, check_erledigt: 0, kommentare: 0 }) })),
    serien: (serien ?? []).filter((s) => darfAufgabeSehen({ ...(s as Zeile), created_by: (s as { created_by: string | null }).created_by }, boardMap, ich)),
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
    .select('id, name, besitzer_id, beschreibung, farbe, sortierung, archiviert, created_by')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
