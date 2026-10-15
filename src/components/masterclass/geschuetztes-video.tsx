'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { toast } from 'sonner';

/**
 * Masterclass-Video ohne Vorspulen: YouTube und Vimeo über ihre Player-APIs.
 * Gemessen wird die weiteste angeschaute Stelle. Springt jemand darüber hinaus (Leiste, Tastatur, Kapitel),
 * geht es zurück an diese Stelle. Abspielgeschwindigkeit bleibt bei 1×. Stand bleibt pro Lektion im Browser.
 * Loom/Google Drive haben keine Player-API – dort zählt nur die Zeit (Seite).
 */

export interface VideoStand {
  weiteste: number;
  dauer: number | null;
}

export interface VideoSteuerung {
  /** Zu einer Stelle springen – nur bis zur weitesten angeschauten Stelle */
  springe: (sek: number) => boolean;
}

/** Ab diesem Anteil gilt ein Video als angeschaut (Abspann muss nicht laufen) */
export const ANGESCHAUT_AB = 0.95;

type Anbieter = 'youtube' | 'vimeo';
const SPRUNG_TOLERANZ = 2.5;

interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  seekTo(s: number, allowSeekAhead: boolean): void;
  setPlaybackRate(r: number): void;
  destroy(): void;
}
interface VimeoPlayer {
  on(ev: string, cb: (d: { seconds?: number; duration?: number; playbackRate?: number }) => void): void;
  setCurrentTime(s: number): Promise<number>;
  setPlaybackRate(r: number): Promise<number>;
  getDuration(): Promise<number>;
  destroy(): Promise<void>;
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLIFrameElement, opts: { events: Record<string, (e: { data: number }) => void> }) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
    Vimeo?: { Player: new (el: HTMLIFrameElement) => VimeoPlayer };
  }
}

const skripte = new Map<string, Promise<void>>();
function ladeSkript(src: string, bereit: () => boolean): Promise<void> {
  if (bereit()) return Promise.resolve();
  let p = skripte.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onerror = () => reject(new Error('Player konnte nicht geladen werden'));
      if (src.includes('youtube')) {
        const vorher = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          vorher?.();
          resolve();
        };
      } else s.onload = () => resolve();
      document.head.appendChild(s);
    });
    skripte.set(src, p);
  }
  return p;
}

export function anbieterVon(embed: string): Anbieter | null {
  if (embed.includes('youtube')) return 'youtube';
  if (embed.includes('player.vimeo.com')) return 'vimeo';
  return null;
}

function lies(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}
function schreib(key: string, v: number) {
  try {
    localStorage.setItem(key, String(Math.floor(v)));
  } catch {
    /* privates Fenster */
  }
}

export function GeschuetztesVideo({
  embed,
  lessonId,
  title,
  geschuetzt,
  onStand,
  steuerungRef,
}: {
  embed: string;
  lessonId: string;
  title: string;
  /** false = frei spulen (z. B. Admin-Vorschau oder schon erledigt) */
  geschuetzt: boolean;
  onStand: (s: VideoStand) => void;
  steuerungRef: RefObject<VideoSteuerung | null>;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const anbieter = anbieterVon(embed);
  const onStandRef = useRef(onStand);
  const geschuetztRef = useRef(geschuetzt);
  useEffect(() => {
    onStandRef.current = onStand;
    geschuetztRef.current = geschuetzt;
  }, [onStand, geschuetzt]);

  // YouTube braucht enablejsapi, Steuerung per Tastatur aus
  const src = anbieter === 'youtube' ? `${embed}${embed.includes('?') ? '&' : '?'}enablejsapi=1&disablekb=1&playsinline=1` : embed;

  useEffect(() => {
    const el = iframe.current;
    if (!el || !anbieter) return;
    const key = `mc_seh_${lessonId}`;
    let weiteste = lies(key);
    let dauer: number | null = null;
    let hinweis = 0;
    let aus = false;
    let zurueck: (s: number) => void = () => {};

    const melde = () => onStandRef.current({ weiteste, dauer });
    // Neue Position prüfen: zu weit gesprungen → zurück, sonst Fortschritt merken
    const position = (t: number) => {
      if (geschuetztRef.current && t > weiteste + SPRUNG_TOLERANZ) {
        zurueck(weiteste);
        if (Date.now() - hinweis > 4000) {
          hinweis = Date.now();
          toast('Vorspulen ist in der Masterclass nicht möglich – das Video läuft ab deiner Stelle weiter.');
        }
        return;
      }
      if (t > weiteste) {
        weiteste = t;
        schreib(key, weiteste);
        melde();
      }
    };

    steuerungRef.current = {
      springe: (sek) => {
        if (geschuetztRef.current && sek > weiteste + SPRUNG_TOLERANZ) return false;
        zurueck(sek);
        return true;
      },
    };
    melde();

    let ytPlayer: YTPlayer | null = null;
    let vmPlayer: VimeoPlayer | null = null;
    let takt: ReturnType<typeof setInterval> | null = null;

    if (anbieter === 'youtube') {
      void ladeSkript('https://www.youtube.com/iframe_api', () => !!window.YT?.Player).then(() => {
        if (aus || !window.YT) return;
        ytPlayer = new window.YT.Player(el, {
          events: {
            onReady: () => {
              if (!ytPlayer) return;
              dauer = ytPlayer.getDuration() || null;
              if (weiteste > 5) ytPlayer.seekTo(weiteste, true);
              melde();
            },
            onPlaybackRateChange: (e) => {
              if (geschuetztRef.current && e.data !== 1) ytPlayer?.setPlaybackRate(1);
            },
          },
        });
        zurueck = (s) => ytPlayer?.seekTo(s, true);
        takt = setInterval(() => {
          if (!ytPlayer?.getCurrentTime) return;
          if (!dauer) dauer = ytPlayer.getDuration() || null;
          position(ytPlayer.getCurrentTime());
        }, 500);
      });
    } else {
      void ladeSkript('https://player.vimeo.com/api/player.js', () => !!window.Vimeo?.Player).then(() => {
        if (aus || !window.Vimeo) return;
        vmPlayer = new window.Vimeo.Player(el);
        zurueck = (s) => void vmPlayer?.setCurrentTime(s).catch(() => {});
        void vmPlayer.getDuration().then((d) => {
          dauer = d || null;
          if (weiteste > 5) zurueck(weiteste);
          melde();
        });
        vmPlayer.on('timeupdate', (d) => typeof d.seconds === 'number' && position(d.seconds));
        vmPlayer.on('seeked', (d) => typeof d.seconds === 'number' && position(d.seconds));
        vmPlayer.on('playbackratechange', (d) => {
          if (geschuetztRef.current && d.playbackRate !== 1) void vmPlayer?.setPlaybackRate(1).catch(() => {});
        });
      });
    }

    return () => {
      aus = true;
      if (takt) clearInterval(takt);
      ytPlayer?.destroy();
      void vmPlayer?.destroy().catch(() => {});
      steuerungRef.current = null;
    };
  }, [anbieter, lessonId, src, steuerungRef]);

  return (
    <iframe
      ref={iframe}
      key={src}
      src={src}
      title={title}
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      className="h-full w-full"
    />
  );
}
