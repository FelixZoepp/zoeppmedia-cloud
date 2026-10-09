import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { ladeErlaubteAufgabe } from '@/lib/aufgaben/zugriff-aufgabe';
import type { SupabaseClient } from '@supabase/supabase-js';

async function pruefe(svc: SupabaseClient, cid: string, user: { id: string; role: string }) {
  const { data } = await svc.from('aufgaben_checkliste').select('task_id').eq('id', cid).maybeSingle();
  if (!data) return { fehler: 'Nicht gefunden', status: 404 as const };
  return ladeErlaubteAufgabe(svc, (data as { task_id: string }).task_id, user);
}

/** PATCH { erledigt?, text? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ cid: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { cid } = await params;
  const svc = createAdminClient();
  const r = await pruefe(svc, cid, user);
  if ('fehler' in r) return NextResponse.json({ error: r.fehler }, { status: r.status });
  const b = (await req.json().catch(() => ({}))) as { erledigt?: boolean; text?: string };
  const patch: Record<string, unknown> = {};
  if (typeof b.erledigt === 'boolean') patch.erledigt = b.erledigt;
  if (typeof b.text === 'string' && b.text.trim()) patch.text = b.text.trim().slice(0, 300);
  const { data, error } = await svc.from('aufgaben_checkliste').update(patch).eq('id', cid).select('id, text, erledigt, position').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ cid: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { cid } = await params;
  const svc = createAdminClient();
  const r = await pruefe(svc, cid, user);
  if ('fehler' in r) return NextResponse.json({ error: r.fehler }, { status: r.status });
  const { error } = await svc.from('aufgaben_checkliste').delete().eq('id', cid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
