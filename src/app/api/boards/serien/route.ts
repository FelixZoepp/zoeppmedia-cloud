import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { benachrichtige, boardVon, PRIORITAETEN } from '@/lib/aufgaben/boards';
import { ersterTermin, legeSerienAufgabenAn, type Rhythmus } from '@/lib/aufgaben/serien';
import { bereinigeRegel } from '@/lib/aufgaben/regeln';
import { berlinTag } from '@/lib/zeit/berlin';

/** POST – wiederkehrende Aufgabe anlegen */
export async function POST(req: NextRequest) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const rhythmus = b.rhythmus as Rhythmus;
  if (!title || !['taeglich', 'woechentlich', 'monatlich'].includes(rhythmus)) return NextResponse.json({ error: 'Titel und Rhythmus nötig' }, { status: 400 });
  const svc = createAdminClient();
  const assigned = typeof b.assigned_to === 'string' && b.assigned_to ? b.assigned_to : user.id;
  const { wochentag, monatstag, nur_werktags: nurWerktags } = bereinigeRegel({ rhythmus, wochentag: b.wochentag as number, monatstag: b.monatstag as number, nur_werktags: b.nur_werktags as boolean });
  const { data, error } = await svc
    .from('aufgaben_serien')
    .insert({
      title: title.slice(0, 200),
      description: typeof b.description === 'string' && b.description.trim() ? b.description.slice(0, 5000) : null,
      assigned_to: assigned,
      board_id: typeof b.board_id === 'string' && b.board_id ? b.board_id : await boardVon(svc, assigned),
      priority: PRIORITAETEN.includes(b.priority as never) ? b.priority : 'medium',
      rhythmus,
      wochentag: rhythmus === 'woechentlich' ? wochentag : null,
      monatstag: rhythmus === 'monatlich' ? monatstag : null,
      nur_werktags: nurWerktags,
      naechste_am: ersterTermin({ rhythmus, wochentag, monatstag, nur_werktags: nurWerktags }, berlinTag()),
      created_by: user.id,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await benachrichtige(svc, data as { id: string; title: string; assigned_to: string | null }, user.id, user.name, 'serie');
  await legeSerienAufgabenAn(svc, new Date(), (data as { id: string }).id).catch(() => 0);
  return NextResponse.json(data);
}
