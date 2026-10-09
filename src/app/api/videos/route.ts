import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { meldeVideo, standardPruefer } from '@/lib/videos/ablauf';
import { VIDEO_ARTEN, VIDEO_BUCKET } from '@/lib/videos/konstanten';

/** GET – alle Videos mit Kunde, Version, offenen Kommentaren; dazu Kunden + Team für die Formulare */
export async function GET() {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const svc = createAdminClient();
  const [{ data: videos }, { data: offen }, { data: agencies }, { data: team }] = await Promise.all([
    svc.from('videos').select('*, agencies(name)').order('updated_at', { ascending: false }).limit(500),
    svc.from('video_kommentare').select('video_id').eq('erledigt', false),
    svc.from('agencies').select('id, name').order('name'),
    svc.from('users').select('id, name, avatar_url, aktiv').in('role', ['admin', 'employee']).order('name'),
  ]);
  const zahl = new Map<string, number>();
  for (const k of (offen ?? []) as Array<{ video_id: string }>) zahl.set(k.video_id, (zahl.get(k.video_id) ?? 0) + 1);
  return NextResponse.json({
    ich: { id: user.id, role: user.role },
    standardPruefer: await standardPruefer(svc),
    videos: ((videos ?? []) as Array<Record<string, unknown> & { id: string }>).map((v) => ({ ...v, offene_kommentare: zahl.get(v.id) ?? 0 })),
    agencies: agencies ?? [],
    team: ((team ?? []) as Array<{ id: string; name: string; avatar_url: string | null; aktiv: boolean | null }>).filter((t) => t.aktiv !== false),
  });
}

/** POST { titel, agency_id?, art, bearbeiter_id?, pruefer_id?, faellig_am?, pfad, dateiname, groesse, dauer_s } – Video + Version 1 */
export async function POST(req: NextRequest) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const titel = typeof b.titel === 'string' ? b.titel.trim() : '';
  const pfad = typeof b.pfad === 'string' ? b.pfad : '';
  if (!titel || !pfad) return NextResponse.json({ error: 'Titel und Datei nötig' }, { status: 400 });
  const svc = createAdminClient();
  // Datei muss wirklich hochgeladen sein
  const ordner = pfad.split('/').slice(0, -1).join('/');
  const { data: liste } = await svc.storage.from(VIDEO_BUCKET).list(ordner, { search: pfad.split('/').pop() });
  if (!liste?.length) return NextResponse.json({ error: 'Upload nicht gefunden – bitte nochmal hochladen' }, { status: 400 });

  const pruefer = typeof b.pruefer_id === 'string' && b.pruefer_id ? b.pruefer_id : await standardPruefer(svc);
  const bearbeiter = typeof b.bearbeiter_id === 'string' && b.bearbeiter_id ? b.bearbeiter_id : user.id;
  const { data: video, error } = await svc
    .from('videos')
    .insert({
      titel: titel.slice(0, 160),
      agency_id: typeof b.agency_id === 'string' && b.agency_id ? b.agency_id : null,
      art: typeof b.art === 'string' && b.art in VIDEO_ARTEN ? b.art : 'ad',
      bearbeiter_id: bearbeiter,
      pruefer_id: pruefer,
      faellig_am: typeof b.faellig_am === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.faellig_am) ? b.faellig_am : null,
      created_by: user.id,
    })
    .select('id, titel')
    .single();
  if (error || !video) return NextResponse.json({ error: error?.message ?? 'Fehler' }, { status: 500 });
  const { data: version, error: vErr } = await svc
    .from('video_versionen')
    .insert({
      video_id: (video as { id: string }).id,
      version: 1,
      storage_pfad: pfad,
      dateiname: typeof b.dateiname === 'string' ? b.dateiname.slice(0, 200) : null,
      groesse_bytes: typeof b.groesse === 'number' ? Math.round(b.groesse) : null,
      dauer_s: typeof b.dauer_s === 'number' && Number.isFinite(b.dauer_s) ? b.dauer_s : null,
      hochgeladen_von: user.id,
    })
    .select('id')
    .single();
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
  await meldeVideo(svc, pruefer, user.id, (video as { id: string }).id, `Neues Video zur Freigabe: ${titel}`, `Von ${user.name ?? 'Team'}`);
  return NextResponse.json({ id: (video as { id: string }).id, version_id: (version as { id: string }).id });
}
