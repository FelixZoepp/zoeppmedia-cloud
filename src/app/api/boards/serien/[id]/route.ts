import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { ersterTermin, legeSerienAufgabenAn } from '@/lib/aufgaben/serien';
import { bereinigeRegel } from '@/lib/aufgaben/regeln';
import { PRIORITAETEN } from '@/lib/aufgaben/konstanten';
import { berlinTag } from '@/lib/zeit/berlin';

/** PATCH – Serie ändern (aktiv, Titel, Zuständig, Rhythmus …); Termin wird neu berechnet */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const svc = createAdminClient();
  const { data: alt } = await svc.from('aufgaben_serien').select('*').eq('id', id).maybeSingle();
  if (!alt) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  const s = { ...(alt as Record<string, unknown>) };
  for (const k of ['title', 'description', 'assigned_to', 'board_id', 'priority', 'rhythmus', 'wochentag', 'monatstag', 'nur_werktags', 'aktiv']) if (k in b) s[k] = b[k];
  if (!PRIORITAETEN.includes(s.priority as never)) s.priority = (alt as { priority: string }).priority;
  const regel = bereinigeRegel(s as never);
  const regelGeaendert = ['rhythmus', 'wochentag', 'monatstag', 'nur_werktags', 'aktiv'].some((k) => k in b);
  const titel = typeof s.title === 'string' && s.title.trim() ? s.title.trim().slice(0, 200) : (alt as { title: string }).title;
  const { data, error } = await svc
    .from('aufgaben_serien')
    .update({
      title: titel,
      description: typeof s.description === 'string' ? s.description.slice(0, 5000) : null,
      assigned_to: typeof s.assigned_to === 'string' && s.assigned_to ? s.assigned_to : null,
      board_id: typeof s.board_id === 'string' && s.board_id ? s.board_id : null,
      priority: s.priority,
      rhythmus: regel.rhythmus,
      wochentag: regel.rhythmus === 'woechentlich' ? regel.wochentag : null,
      monatstag: regel.rhythmus === 'monatlich' ? regel.monatstag : null,
      nur_werktags: regel.nur_werktags,
      aktiv: s.aktiv !== false,
      // Nur bei geänderter Regel neu rechnen – ab heute; fehlt die heutige Aufgabe, wird sie gleich angelegt
      ...(regelGeaendert ? { naechste_am: ersterTermin(regel, berlinTag()) } : {}),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (!error && regelGeaendert && s.aktiv !== false) await legeSerienAufgabenAn(svc, new Date(), id).catch(() => 0);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const { error } = await createAdminClient().from('aufgaben_serien').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
