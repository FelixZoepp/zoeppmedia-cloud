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
 * Standbilder mit Zeitstempel für die KI-Prüfung: ca. alle 1,5 s, höchstens MAX_STANDBILDER (gleichmäßig verteilt).
 * Funktioniert mit lokaler Datei (Object-URL) und signierten Storage-URLs.
 */
export function standbilderMitZeit(src: string, onFortschritt?: (anteil: number) => void): Promise<Array<{ zeit: number; bild: string }>> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    // iOS lädt Bilder nur zuverlässig, wenn das Video im DOM hängt – unsichtbar
    v.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
    document.body.appendChild(v);
    v.src = src;
    const bilder: Array<{ zeit: number; bild: string }> = [];
    const fertig = () => {
      clearTimeout(timeout);
      v.remove();
      resolve(bilder);
    };
    const timeout = setTimeout(fertig, 180000);
    v.onerror = fertig;
    v.onloadedmetadata = async () => {
      const d = v.duration;
      if (!d || !Number.isFinite(d)) return fertig();
      const abstand = Math.max(1.5, d / MAX_STANDBILDER);
      const zeiten: number[] = [];
      for (let t = Math.min(0.3, d / 2); t < d && zeiten.length < MAX_STANDBILDER; t += abstand) zeiten.push(t);
      // Kurze Seite ~540 px (Untertitel lesbar, auch bei 9:16), lange Seite max. 960 px – Anfrage bleibt unter 4,5 MB
      const w = v.videoWidth || 960;
      const h = v.videoHeight || 540;
      const scale = Math.min(1, 540 / Math.min(w, h), 960 / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      try {
        for (let i = 0; i < zeiten.length; i++) {
          const ok = await new Promise<boolean>((r) => {
            const t = setTimeout(() => r(false), 3000);
            v.onseeked = () => {
              clearTimeout(t);
              r(true);
            };
            v.currentTime = zeiten[i];
          });
          if (!ok) continue;
          ctx?.drawImage(v, 0, 0, canvas.width, canvas.height);
          bilder.push({ zeit: Math.round(zeiten[i] * 10) / 10, bild: canvas.toDataURL('image/jpeg', 0.6) });
          onFortschritt?.((i + 1) / zeiten.length);
        }
      } catch {
        // Canvas „tainted“ (Quelle ohne CORS) → ohne Standbilder
        bilder.length = 0;
      }
      fertig();
    };
  });
}
