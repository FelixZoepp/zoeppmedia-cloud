import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { beantworteFragen } from '@/lib/akademie/aufnahme';

export const maxDuration = 300;

const MAX_AUDIO = 4 * 1024 * 1024;

/** POST (multipart: text?, audio?) – offene Fragen beantworten, Entwurf wird überarbeitet (nur Admin) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  if (!form) return fehler('Formular erwartet');

  let text = String(form.get('text') ?? '').trim();
  const audio = form.get('audio');
  try {
    if (audio instanceof File && audio.size > 0) {
      if (audio.size > MAX_AUDIO) return fehler('Sprachnachricht ist zu lang (max. ca. 10 Minuten)');
      const { transcribeAudio } = await import('@/lib/recordings/transcribe');
      const gesprochen = await transcribeAudio(Buffer.from(await audio.arrayBuffer()), audio.name || 'antwort.webm');
      text = [text, gesprochen.trim()].filter(Boolean).join('\n\n');
    }
    const ergebnis = await beantworteFragen(k.svc, id, text);
    return NextResponse.json(ergebnis);
  } catch (err) {
    return fehler(err instanceof Error ? err.message : 'Antworten konnten nicht verarbeitet werden', 422);
  }
}
