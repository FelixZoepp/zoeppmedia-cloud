import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';

/** PATCH { erledigt?, text? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ kid: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { kid } = await params;
  const b = (await req.json().catch(() => ({}))) as { erledigt?: boolean; text?: string };
  const patch: Record<string, unknown> = {};
  if (typeof b.erledigt === 'boolean') patch.erledigt = b.erledigt;
  if (typeof b.text === 'string' && b.text.trim()) patch.text = b.text.trim().slice(0, 3000);
  const { data, error } = await createAdminClient().from('video_kommentare').update(patch).eq('id', kid).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ kid: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { kid } = await params;
  const svc = createAdminClient();
  // Nur eigene Kommentare oder als Admin
  const { data: k } = await svc.from('video_kommentare').select('autor_id').eq('id', kid).maybeSingle();
  if (!k) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  if ((k as { autor_id: string | null }).autor_id !== user.id && user.role !== 'admin') return NextResponse.json({ error: 'Nur eigene Kommentare' }, { status: 403 });
  const { error } = await svc.from('video_kommentare').delete().eq('id', kid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
