import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';

const FARBEN = ['rot', 'orange', 'gelb', 'gruen', 'blau', 'lila', 'grau'];

/** PATCH { name?, beschreibung?, farbe?, archiviert? } – Team-Board bearbeiten (persönliche Boards: nur Farbe) */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const svc = createAdminClient();
  const { data: board } = await svc.from('aufgaben_boards').select('id, besitzer_id, created_by').eq('id', id).maybeSingle();
  const b0 = board as { id: string; besitzer_id: string | null; created_by: string | null } | null;
  if (!b0) return NextResponse.json({ error: 'Board nicht gefunden' }, { status: 404 });
  const istTeam = !b0.besitzer_id;
  // Team-Boards: Admin oder wer es angelegt hat; persönliche Boards: Besitzer oder Admin
  const darf = user.role === 'admin' || (istTeam ? b0.created_by === user.id : b0.besitzer_id === user.id);
  if (!darf) return NextResponse.json({ error: 'Kein Zugriff auf dieses Board' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { name?: string; beschreibung?: string; farbe?: string; archiviert?: boolean };
  const patch: Record<string, unknown> = {};
  if (istTeam && typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim().slice(0, 80);
  if (istTeam && typeof b.beschreibung === 'string') patch.beschreibung = b.beschreibung.slice(0, 300) || null;
  if (typeof b.farbe === 'string' && FARBEN.includes(b.farbe)) patch.farbe = b.farbe;
  if (istTeam && typeof b.archiviert === 'boolean') {
    if (b.archiviert) {
      // Offene Aufgaben würden sonst auf keinem Board mehr auftauchen
      const { count } = await svc.from('internal_tasks').select('id', { count: 'exact', head: true }).eq('board_id', id).neq('status', 'done');
      if (count) return NextResponse.json({ error: `Auf dem Board sind noch ${count} offene Aufgaben – erst erledigen oder auf ein anderes Board verschieben.` }, { status: 409 });
    }
    patch.archiviert = b.archiviert;
  }
  const { data, error } = await svc.from('aufgaben_boards').update(patch).eq('id', id).select('id, name, besitzer_id, beschreibung, farbe, sortierung, archiviert, created_by').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
