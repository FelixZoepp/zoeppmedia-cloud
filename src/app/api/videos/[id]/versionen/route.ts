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

  // Atomar in der Datenbank: Row Lock auf dem Video, Nummer vergeben, Version anlegen, Freigabe aufheben
  const { data: rpc, error } = await svc.rpc('video_neue_version', {
    p_video: id,
    p_pfad: pfad,
    p_dateiname: typeof b.dateiname === 'string' ? b.dateiname.slice(0, 200) : null,
    p_groesse: typeof b.groesse === 'number' ? Math.round(b.groesse) : null,
    p_dauer: typeof b.dauer_s === 'number' && Number.isFinite(b.dauer_s) ? b.dauer_s : null,
    p_user: user.id,
  });
  const neu = (Array.isArray(rpc) ? rpc[0] : rpc) as { version_id: string; nr: number } | null;
  if (error || !neu) return NextResponse.json({ error: error?.message ?? 'Version konnte nicht angelegt werden' }, { status: 500 });
  const nr = neu.nr;
  const version = { id: neu.version_id };
  // Hatte der Kunde schon entschieden, wartet die neue Version wieder auf ihn
  await svc.from('videos').update({ kunden_status: 'offen', kunden_entscheidung_am: null }).eq('id', id).not('kunden_status', 'is', null);
  const pruefer = v.pruefer_id ?? (await standardPruefer(svc));
  await meldeVideo(svc, pruefer, user.id, id, `Neue Version ${nr}: ${v.titel}`, `Von ${user.name ?? 'Team'} – bereit zur Prüfung`);
  return NextResponse.json({ version_id: version.id, version: nr });
}
