import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { ersterTermin, type Rhythmus } from '@/lib/aufgaben/serien';
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
  const regel = { rhythmus: s.rhythmus as Rhythmus, wochentag: (s.wochentag as number) ?? 1, monatstag: (s.monatstag as number) ?? 1, nur_werktags: s.nur_werktags !== false };
  const { data, error } = await svc
    .from('aufgaben_serien')
    .update({
      title: String(s.title).slice(0, 200),
      description: s.description ?? null,
      assigned_to: s.assigned_to ?? null,
      board_id: s.board_id ?? null,
      priority: s.priority,
      rhythmus: regel.rhythmus,
      wochentag: regel.rhythmus === 'woechentlich' ? regel.wochentag : null,
      monatstag: regel.rhythmus === 'monatlich' ? regel.monatstag : null,
      nur_werktags: regel.nur_werktags,
      aktiv: s.aktiv !== false,
      naechste_am: ersterTermin(regel, berlinTag(new Date(Date.now() + 864e5))),
    })
    .eq('id', id)
    .select('*')
    .single();
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
