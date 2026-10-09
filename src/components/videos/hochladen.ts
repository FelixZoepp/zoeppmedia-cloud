'use client';

import { createClient } from '@/lib/supabase/client';
import { MAX_VIDEO_MB, VIDEO_BUCKET } from '@/lib/videos/konstanten';
import { videoDauer } from './standbilder';

/** Video direkt in den Storage laden (signierte Upload-URL) – gibt Pfad, Dauer und lokale Vorschau-URL zurück */
export async function ladeVideoHoch(datei: File): Promise<{ pfad: string; dauer: number | null; lokaleUrl: string }> {
  if (!datei.type.startsWith('video/')) throw new Error('Bitte eine Videodatei wählen');
  if (datei.size > MAX_VIDEO_MB * 1024 * 1024) {
    throw new Error(`Datei zu groß (${Math.round(datei.size / 1024 / 1024)} MB, max. ${MAX_VIDEO_MB} MB) – bitte komprimiert exportieren (1080p, H.264)`);
  }
  const lokaleUrl = URL.createObjectURL(datei);
  const dauer = await videoDauer(lokaleUrl);
  const r = await fetch('/api/videos/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateiname: datei.name, groesse: datei.size }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? 'Upload nicht möglich');
  const { error } = await createClient().storage.from(VIDEO_BUCKET).uploadToSignedUrl(j.pfad, j.token, datei, { contentType: datei.type });
  if (error) throw new Error(`Upload fehlgeschlagen: ${error.message}`);
  return { pfad: j.pfad, dauer, lokaleUrl };
}
