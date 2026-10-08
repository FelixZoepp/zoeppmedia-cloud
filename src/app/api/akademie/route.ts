import { NextResponse } from 'next/server';
import { akademieKontext } from '@/lib/akademie/api';
import { ladeFortschritt, ladeSichtbareArtikel, ladeVideos } from '@/lib/akademie/daten';
import { POSITIONEN, vorschlagFuer } from '@/lib/akademie/positionen';

/** GET – sichtbare Artikel (ohne Volltext), Positionen, eigener Fortschritt */
export async function GET() {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  try {
    const [artikel, fortschritt, videos] = await Promise.all([ladeSichtbareArtikel(k.svc, k.zugriff), ladeFortschritt(k.svc, k.user.id), ladeVideos(k.svc)]);
    const videoMap = Object.fromEntries(videos.map((v) => [v.key, { status: v.status, laenge_min: v.laenge_min, hatVideo: !!v.video_url }]));
    return NextResponse.json({
      admin: k.zugriff.admin,
      meinePositionen: k.zugriff.admin ? POSITIONEN.map((p) => p.id) : [...k.zugriff.positionen],
      vorschlag: vorschlagFuer(k.user.funktion),
      positionen: POSITIONEN,
      artikel: artikel.map((a) => ({
        slug: a.slug,
        typ: a.typ,
        titel: a.titel,
        modul: a.modul,
        positionen: a.positionen,
        status: a.status,
        zusammenfassung: a.zusammenfassung,
        prioritaet: a.prioritaet,
        reihenfolge: a.reihenfolge,
        ergaenzt_slug: a.ergaenzt_slug,
        video: a.video_key ? videoMap[a.video_key] ?? null : null,
      })),
      fortschritt,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}
