import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { gruppiereAufnahmen, ladeSichtbareArtikel, ladeVideos } from '@/lib/akademie/daten';
import { detectProvider } from '@/lib/masterclass/lesson';
import { AUFNAHME_BUCKET } from '@/lib/akademie/aufnahme';

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
  /** Hochgeladene Datei (Pfad aus POST) statt Link */
  datei_pfad: z.string().regex(/^muster\/[a-z0-9_-]+-\d+\.(mp3|m4a|wav|ogg|webm|mp4|mov)$/).optional(),
});

/** PATCH – Video-Link eintragen bzw. Status/Drehbuch ändern (nur Admin) */
export async function PATCH(req: NextRequest) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fehler('Ungültige Eingabe');
  const { key, datei_pfad, ...rest } = parsed.data;
  if (datei_pfad) {
    if (!datei_pfad.startsWith(`muster/${key}-`)) return fehler('Datei passt nicht zum Video');
    rest.video_url = undefined;
  }
  if (rest.video_url && !detectProvider(rest.video_url)) return fehler('Bitte einen Link von Loom, YouTube, Vimeo oder Google Drive');
  const patch: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };
  if (datei_pfad) patch.video_url = `storage:${AUFNAHME_BUCKET}/${datei_pfad}`;
  if (rest.video_url || datei_pfad) {
    patch.status = rest.status ?? 'aufgenommen';
    patch.aufgenommen_am = new Date().toISOString();
  }
  const { error } = await k.svc.from('akademie_videos').update(patch).eq('key', key);
  if (error) return fehler(error.message, 500);
  return NextResponse.json({ ok: true });
}

const uploadSchema = z.object({ key: z.string().regex(/^[a-z0-9_-]{1,60}$/), dateiname: z.string().min(1).max(200), groesse: z.number().int().positive() });
const ENDUNGEN = ['mp3', 'm4a', 'wav', 'ogg', 'webm', 'mp4', 'mov'];

/** POST – Upload-Link für eine Audio-/Videodatei zu einem Video (z. B. Gesprächsaufnahme als Musterbeispiel, nur Admin, max. 50 MB) */
export async function POST(req: NextRequest) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const parsed = uploadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fehler('Ungültige Eingabe');
  const { key, dateiname, groesse } = parsed.data;
  const endung = dateiname.split('.').pop()?.toLowerCase() ?? '';
  if (!ENDUNGEN.includes(endung)) return fehler('Bitte eine Audio- oder Videodatei (mp3, m4a, wav, mp4 …)');
  if (groesse > 50 * 1024 * 1024) return fehler('Datei ist größer als 50 MB');
  const { data: v } = await k.svc.from('akademie_videos').select('key').eq('key', key).maybeSingle();
  if (!v) return fehler('Video nicht gefunden', 404);
  const pfad = `muster/${key}-${Date.now()}.${endung}`;
  const { data, error } = await k.svc.storage.from(AUFNAHME_BUCKET).createSignedUploadUrl(pfad);
  if (error || !data) return fehler(error?.message ?? 'Upload-Link fehlgeschlagen', 500);
  return NextResponse.json({ signedUrl: data.signedUrl, pfad });
}
