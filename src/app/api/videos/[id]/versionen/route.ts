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

  // Versionsnummer: bei gleichzeitigem Upload (Konflikt auf video_id + version) einmal neu versuchen
  let nr = 0;
  let version: { id: string } | null = null;
  for (let versuch = 0; versuch < 3 && !version; versuch++) {
    const { data: letzte } = await svc.from('video_versionen').select('version').eq('video_id', id).order('version', { ascending: false }).limit(1).maybeSingle();
    nr = ((letzte as { version: number } | null)?.version ?? 0) + 1;
    const { data, error } = await svc
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
    if (error && error.code !== '23505') return NextResponse.json({ error: error.message }, { status: 500 });
    version = (data as { id: string } | null) ?? null;
  }
  if (!version) return NextResponse.json({ error: 'Version konnte nicht angelegt werden – bitte nochmal versuchen' }, { status: 409 });
  // Neue Version hebt eine frühere Freigabe immer auf
  const { error: uErr } = await svc
    .from('videos')
    .update({ aktuelle_version: nr, status: 'in_pruefung', freigegeben_am: null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (uErr) return NextResponse.json({ error: `Version gespeichert, Status nicht aktualisiert: ${uErr.message}` }, { status: 500 });
  const pruefer = v.pruefer_id ?? (await standardPruefer(svc));
  await meldeVideo(svc, pruefer, user.id, id, `Neue Version ${nr}: ${v.titel}`, `Von ${user.name ?? 'Team'} – bereit zur Prüfung`);
  return NextResponse.json({ version_id: version.id, version: nr });
}
