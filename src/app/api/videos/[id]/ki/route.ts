import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { pruefeVideoTexte } from '@/lib/videos/ki';

export const maxDuration = 300;

/** POST { version_id, frames: [{ zeit, bild }] } – KI-Rechtschreibprüfung (Standbilder kommen aus dem Browser) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { version_id?: string; frames?: unknown };
  if (!b.version_id) return NextResponse.json({ error: 'Version fehlt' }, { status: 400 });
  const svc = createAdminClient();
  const { data: v } = await svc.from('video_versionen').select('id').eq('id', b.version_id).eq('video_id', id).maybeSingle();
  if (!v) return NextResponse.json({ error: 'Version nicht gefunden' }, { status: 404 });
  try {
    return NextResponse.json(await pruefeVideoTexte(svc, b.version_id, b.frames, user.id));
  } catch (err) {
    console.error('[videos/ki]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'KI-Prüfung fehlgeschlagen' }, { status: 502 });
  }
}
