import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { MAX_VIDEO_MB, sichererDateiname, VIDEO_BUCKET } from '@/lib/videos/konstanten';

/** POST { dateiname, groesse } – signierte Upload-URL für den direkten Upload aus dem Browser */
export async function POST(req: NextRequest) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { dateiname?: string; groesse?: number };
  if (typeof b.groesse === 'number' && b.groesse > MAX_VIDEO_MB * 1024 * 1024) {
    return NextResponse.json({ error: `Datei zu groß (max. ${MAX_VIDEO_MB} MB) – bitte komprimiert exportieren (z. B. 1080p, H.264)` }, { status: 400 });
  }
  const pfad = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}-${sichererDateiname(b.dateiname ?? 'video.mp4')}`;
  const { data, error } = await createAdminClient().storage.from(VIDEO_BUCKET).createSignedUploadUrl(pfad);
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Upload-URL fehlgeschlagen' }, { status: 500 });
  return NextResponse.json({ pfad, token: data.token });
}
