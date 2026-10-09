'use client';

import { MAX_VIDEO_MB } from '@/lib/videos/konstanten';
import { videoDauer } from './standbilder';

/** Datei per XHR an die signierte Upload-URL – mit Fortschritt (fetch kann keinen Upload-Fortschritt melden) */
function ladeMitFortschritt(url: string, datei: File, onFortschritt?: (anteil: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onFortschritt?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `HTTP ${xhr.status}`;
      try {
        const j = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        msg = j.message || j.error || msg;
      } catch {
        /* Rohtext reicht nicht */
      }
      reject(new Error(`Upload fehlgeschlagen: ${msg}`));
    };
    xhr.onerror = () => reject(new Error('Upload fehlgeschlagen – Verbindung abgebrochen'));
    const body = new FormData();
    body.append('cacheControl', '3600');
    body.append('', datei);
    xhr.send(body);
  });
}

/** Video direkt in den Storage laden (signierte Upload-URL) – gibt Pfad, Dauer und lokale Vorschau-URL zurück */
export async function ladeVideoHoch(datei: File, onFortschritt?: (anteil: number) => void): Promise<{ pfad: string; dauer: number | null; lokaleUrl: string }> {
  if (!datei.type.startsWith('video/')) throw new Error('Bitte eine Videodatei wählen');
  if (datei.size > MAX_VIDEO_MB * 1024 * 1024) {
    throw new Error(`Datei zu groß (${Math.round(datei.size / 1024 / 1024)} MB, max. ${MAX_VIDEO_MB} MB) – bitte komprimiert exportieren (1080p, H.264)`);
  }
  const lokaleUrl = URL.createObjectURL(datei);
  const dauer = await videoDauer(lokaleUrl);
  const r = await fetch('/api/videos/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateiname: datei.name, groesse: datei.size }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? 'Upload nicht möglich');
  try {
    await ladeMitFortschritt(j.signedUrl, datei, onFortschritt);
  } catch (e) {
    URL.revokeObjectURL(lokaleUrl);
    throw e;
  }
  return { pfad: j.pfad, dauer, lokaleUrl };
}
