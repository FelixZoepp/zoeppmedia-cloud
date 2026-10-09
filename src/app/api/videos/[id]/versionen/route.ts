import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { meldeVideo, standardPruefer } from '@/lib/videos/ablauf';
import { VIDEO_BUCKET } from '@/lib/videos/konstanten';

/** POST { pfad, dateiname, groesse, dauer_s } – neue Version hochgeladen → zurück in die Prüfung */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const pfad = typeof b.pfad === 'string' ? b.pfad : '';
  if (!pfad) return NextResponse.json({ error: 'Datei fehlt' }, { status: 400 });
  const svc = createAdminClient();
  const { data: alt } = await svc.from('videos').select('id, titel, aktuelle_version, pruefer_id').eq('id', id).maybeSingle();
  if (!alt) return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  const v = alt as { id: string; titel: string; aktuelle_version: number; pruefer_id: string | null };
  const ordner = pfad.split('/').slice(0, -1).join('/');
  const { data: liste } = await svc.storage.from(VIDEO_BUCKET).list(ordner, { search: pfad.split('/').pop() });
  if (!liste?.length) return NextResponse.json({ error: 'Upload nicht gefunden – bitte nochmal hochladen' }, { status: 400 });

  const { data: letzte } = await svc.from('video_versionen').select('version').eq('video_id', id).order('version', { ascending: false }).limit(1).maybeSingle();
  const nr = ((letzte as { version: number } | null)?.version ?? 0) + 1;
  const { data: version, error } = await svc
    .from('video_versionen')
    .insert({
      video_id: id,
      version: nr,
      storage_pfad: pfad,
      dateiname: typeof b.dateiname === 'string' ? b.dateiname.slice(0, 200) : null,
      groesse_bytes: typeof b.groesse === 'number' ? Math.round(b.groesse) : null,
      dauer_s: typeof b.dauer_s === 'number' && Number.isFinite(b.dauer_s) ? b.dauer_s : null,
      hochgeladen_von: user.id,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await svc.from('videos').update({ aktuelle_version: nr, status: 'in_pruefung', freigegeben_am: null, updated_at: new Date().toISOString() }).eq('id', id);
  const pruefer = v.pruefer_id ?? (await standardPruefer(svc));
  await meldeVideo(svc, pruefer, user.id, id, `Neue Version ${nr}: ${v.titel}`, `Von ${user.name ?? 'Team'} – bereit zur Prüfung`);
  return NextResponse.json({ version_id: (version as { id: string }).id, version: nr });
}
