import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { freigabeUrl } from '@/lib/videos/freigabe';

/** POST – Kunden-Freigabelink anlegen (vorhandener aktiver Link wird wiederverwendet) */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const svc = createAdminClient();
  const { data: v } = await svc.from('videos').select('id, kunden_status').eq('id', id).maybeSingle();
  if (!v) return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  const { data: alt } = await svc.from('video_freigabe_links').select('token').eq('video_id', id).eq('aktiv', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
  let token = (alt as { token: string } | null)?.token;
  if (!token) {
    const { data, error } = await svc.from('video_freigabe_links').insert({ video_id: id, erstellt_von: user.id }).select('token').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    token = (data as { token: string }).token;
  }
  if (!(v as { kunden_status: string | null }).kunden_status) await svc.from('videos').update({ kunden_status: 'offen' }).eq('id', id);
  return NextResponse.json({ token, url: freigabeUrl(token) });
}

/** DELETE – alle Links des Videos deaktivieren (Kunde kommt nicht mehr rein) */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const { error } = await createAdminClient().from('video_freigabe_links').update({ aktiv: false }).eq('video_id', id).eq('aktiv', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
