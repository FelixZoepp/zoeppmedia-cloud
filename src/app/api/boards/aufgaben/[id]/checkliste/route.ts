import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { ladeErlaubteAufgabe } from '@/lib/aufgaben/zugriff-aufgabe';

/** POST { text } – Checklisten-Punkt anlegen */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const text = ((await req.json().catch(() => ({}))) as { text?: string }).text?.trim();
  if (!text) return NextResponse.json({ error: 'Text fehlt' }, { status: 400 });
  const svc = createAdminClient();
  const r = await ladeErlaubteAufgabe(svc, id, user);
  if ('fehler' in r) return NextResponse.json({ error: r.fehler }, { status: r.status });
  const { data, error } = await svc.from('aufgaben_checkliste').insert({ task_id: id, text: text.slice(0, 300), position: Date.now() }).select('id, text, erledigt, position').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
