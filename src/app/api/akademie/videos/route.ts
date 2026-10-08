import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { gruppiereAufnahmen, ladeSichtbareArtikel, ladeVideos } from '@/lib/akademie/daten';
import { detectProvider } from '@/lib/masterclass/lesson';

/** GET – Aufnahme-Liste (offene Videos als Sessions) + alle Videos (nur Admin) */
export async function GET() {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const [videos, artikel] = await Promise.all([ladeVideos(k.svc), ladeSichtbareArtikel(k.svc, k.zugriff)]);
  const liste = gruppiereAufnahmen(videos, artikel);
  const alle = videos
    .map((v) => ({ ...v, sops: artikel.filter((a) => a.video_key === v.key).map((a) => ({ slug: a.slug, titel: a.titel })) }))
    .sort((a, b) => a.session.localeCompare(b.session, 'de') || a.session_reihenfolge - b.session_reihenfolge);
  return NextResponse.json({ ...liste, alle });
}

const schema = z.object({
  key: z.string().min(1).max(60),
  video_url: z.string().url().max(500).nullable().optional(),
  status: z.enum(['aufnahme_noetig', 'aufgenommen', 'nicht_noetig']).optional(),
  drehbuch: z.array(z.string().max(300)).max(15).optional(),
  laenge_min: z.number().int().min(1).max(60).optional(),
});

/** PATCH – Video-Link eintragen bzw. Status/Drehbuch ändern (nur Admin) */
export async function PATCH(req: NextRequest) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fehler('Ungültige Eingabe');
  const { key, ...rest } = parsed.data;
  if (rest.video_url && !detectProvider(rest.video_url)) return fehler('Bitte einen Link von Loom, YouTube, Vimeo oder Google Drive');
  const patch: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };
  if (rest.video_url) {
    patch.status = rest.status ?? 'aufgenommen';
    patch.aufgenommen_am = new Date().toISOString();
  }
  const { error } = await k.svc.from('akademie_videos').update(patch).eq('key', key);
  if (error) return fehler(error.message, 500);
  return NextResponse.json({ ok: true });
}
