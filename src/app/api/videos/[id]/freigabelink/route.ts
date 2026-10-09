import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { darfKundenLink, freigabeUrl } from '@/lib/videos/freigabe';

async function ladeVideo(id: string) {
  const { data } = await createAdminClient().from('videos').select('id, pruefer_id, aktuelle_version, kunden_version, kunden_status').eq('id', id).maybeSingle();
  return data as { id: string; pruefer_id: string | null; aktuelle_version: number; kunden_version: number | null; kunden_status: string | null } | null;
}

/**
 * POST { teilen? } – Kunden-Freigabelink anlegen (aktiver Link wird wiederverwendet).
 * Beim ersten Link bekommt der Kunde die aktuelle Version. teilen: true gibt die aktuelle Version bewusst weiter
 * (z. B. vor der internen Freigabe); der Kunde muss dann neu entscheiden.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const v = await ladeVideo(id);
  if (!v) return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  if (!darfKundenLink(user, v)) return NextResponse.json({ error: 'Kunden-Link nur durch den Prüfer oder einen Admin' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { teilen?: boolean };
  const svc = createAdminClient();
  const { data: alt } = await svc.from('video_freigabe_links').select('token').eq('video_id', id).eq('aktiv', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
  let token = (alt as { token: string } | null)?.token;
  if (!token) {
    const { data, error } = await svc.from('video_freigabe_links').insert({ video_id: id, erstellt_von: user.id }).select('token').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    token = (data as { token: string }).token;
  }
  let kunden_version = v.kunden_version;
  let kunden_status = v.kunden_status;
  if (v.kunden_version === null || (b.teilen && v.kunden_version !== v.aktuelle_version)) {
    kunden_version = v.aktuelle_version;
    kunden_status = 'offen';
    const { error } = await svc.from('videos').update({ kunden_version, kunden_status, kunden_entscheidung_am: null }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ token, url: freigabeUrl(token), kunden_version, kunden_status });
}

/** DELETE – alle Links des Videos deaktivieren (Kunde kommt nicht mehr rein) */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const v = await ladeVideo(id);
  if (!v) return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  if (!darfKundenLink(user, v)) return NextResponse.json({ error: 'Kunden-Link nur durch den Prüfer oder einen Admin' }, { status: 403 });
  const { error } = await createAdminClient().from('video_freigabe_links').update({ aktiv: false }).eq('video_id', id).eq('aktiv', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
