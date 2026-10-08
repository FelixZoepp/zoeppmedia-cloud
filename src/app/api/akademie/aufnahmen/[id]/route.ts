import { NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { AUFNAHME_BUCKET, AUFNAHME_SPALTEN, loescheAufnahme, type Aufnahme } from '@/lib/akademie/aufnahme';

/** GET – Details mit Transkript, signierten Standbildern und Video (nur Admin) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const { id } = await params;
  const { data } = await k.svc.from('akademie_aufnahmen').select(AUFNAHME_SPALTEN).eq('id', id).maybeSingle();
  const a = data as Aufnahme | null;
  if (!a) return fehler('Nicht gefunden', 404);

  const pfade = [...a.bild_pfade, ...(a.video_pfad ? [a.video_pfad] : [])];
  const urls: Record<string, string> = {};
  if (pfade.length) {
    const { data: signiert } = await k.svc.storage.from(AUFNAHME_BUCKET).createSignedUrls(pfade, 3600);
    for (const s of signiert ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
  }
  return NextResponse.json({
    aufnahme: a,
    bilder: a.bild_pfade.map((p) => urls[p]).filter(Boolean),
    video: a.video_pfad ? urls[a.video_pfad] ?? null : null,
  });
}

/** DELETE – Rohdateien, verknüpftes Aufnahme-Video und Datensatz löschen (der SOP-Entwurf bleibt) */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const { id } = await params;
  await loescheAufnahme(k.svc, id);
  return NextResponse.json({ ok: true });
}
