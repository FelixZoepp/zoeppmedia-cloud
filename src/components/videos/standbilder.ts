'use client';

import { MAX_STANDBILDER } from '@/lib/videos/konstanten';

/** Dauer eines Videos (lokale Datei oder URL) in Sekunden */
export function videoDauer(src: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.src = src;
    const t = setTimeout(() => resolve(null), 15000);
    v.onloadedmetadata = () => {
      clearTimeout(t);
      resolve(Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null);
    };
    v.onerror = () => {
      clearTimeout(t);
      resolve(null);
    };
  });
}

/**
 * Standbilder mit Zeitstempel für die KI-Prüfung: ca. alle 1,5 s, höchstens MAX_STANDBILDER,
 * auf 640 px verkleinert (JPEG, Anfrage bleibt unter dem Vercel-Limit von 4,5 MB). Funktioniert mit lokaler Datei (Object-URL) und signierten Storage-URLs.
 */
export function standbilderMitZeit(src: string, onFortschritt?: (anteil: number) => void): Promise<Array<{ zeit: number; bild: string }>> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.preload = 'auto';
    v.src = src;
    const bilder: Array<{ zeit: number; bild: string }> = [];
    const timeout = setTimeout(() => resolve(bilder), 120000);
    v.onerror = () => {
      clearTimeout(timeout);
      resolve(bilder);
    };
    v.onloadedmetadata = async () => {
      const d = v.duration;
      if (!d || !Number.isFinite(d)) {
        clearTimeout(timeout);
        return resolve(bilder);
      }
      const abstand = Math.max(1.5, d / MAX_STANDBILDER);
      const zeiten: number[] = [];
      for (let t = Math.min(0.3, d / 2); t < d && zeiten.length < MAX_STANDBILDER; t += abstand) zeiten.push(t);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 640 / Math.max(v.videoWidth || 640, v.videoHeight || 640));
      canvas.width = Math.round((v.videoWidth || 640) * scale);
      canvas.height = Math.round((v.videoHeight || 640) * scale);
      const ctx = canvas.getContext('2d');
      try {
        for (let i = 0; i < zeiten.length; i++) {
          await new Promise<void>((r) => {
            v.onseeked = () => r();
            v.currentTime = zeiten[i];
          });
          ctx?.drawImage(v, 0, 0, canvas.width, canvas.height);
          bilder.push({ zeit: Math.round(zeiten[i] * 10) / 10, bild: canvas.toDataURL('image/jpeg', 0.6) });
          onFortschritt?.((i + 1) / zeiten.length);
        }
      } catch {
        // Canvas „tainted“ (Quelle ohne CORS) → ohne Standbilder
        bilder.length = 0;
      }
      clearTimeout(timeout);
      resolve(bilder);
    };
  });
}
