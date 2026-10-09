'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Bildrate für „Bild für Bild“ – Schnitt bei uns in 25 fps */
export const FPS = 25;

export const KUERZEL: Array<[string, string]> = [
  ['Leertaste', 'Abspielen / Pause'],
  ['K', 'Pause'],
  ['L', 'Abspielen (mehrfach: 2× / 4× schneller)'],
  ['J', '5 Sekunden zurück'],
  ['← / →', 'ein Bild zurück / vor'],
  ['⇧ + ← / →', 'eine Sekunde zurück / vor'],
  ['C', 'Kommentar schreiben'],
  ['I / O', 'Bereich Anfang / Ende setzen'],
  ['F', 'Vollbild'],
];

/**
 * Player-Tastenkürzel wie in Frame.io/Premiere. Greift nicht, solange in ein Eingabefeld getippt wird.
 * Bei geöffnetem Vergleich steuern die Kürzel beide Player (zweiter Player optional).
 */
export function useTastenkuerzel(
  player: RefObject<HTMLVideoElement | null>,
  aktionen: { onKommentar?: () => void; onAnfang?: (s: number) => void; onEnde?: (s: number) => void },
  aktiv = true,
) {
  const ref = useRef(aktionen);
  useEffect(() => {
    ref.current = aktionen;
  });

  useEffect(() => {
    if (!aktiv) return;
    const taste = (e: KeyboardEvent) => {
      const v = player.current;
      if (!v || e.metaKey || e.ctrlKey || e.altKey) return;
      const ziel = e.target as HTMLElement | null;
      if (ziel && (ziel.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(ziel.tagName))) return;
      const dauer = Number.isFinite(v.duration) ? v.duration : Infinity;
      const setze = (s: number) => {
        v.currentTime = Math.min(Math.max(0, s), dauer);
      };
      const k = e.key.toLowerCase();
      if (e.key === ' ' || k === 'k' || k === 'l' || k === 'j' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || k === 'c' || k === 'i' || k === 'o' || k === 'f') e.preventDefault();
      else return;
      if (e.key === ' ') {
        v.playbackRate = 1;
        if (v.paused) void v.play();
        else v.pause();
      } else if (k === 'k') {
        v.pause();
        v.playbackRate = 1;
      } else if (k === 'l') {
        if (v.paused) {
          v.playbackRate = 1;
          void v.play();
        } else v.playbackRate = Math.min(4, v.playbackRate * 2);
      } else if (k === 'j') {
        v.playbackRate = 1;
        setze(v.currentTime - 5);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        v.pause();
        const schritt = e.shiftKey ? 1 : 1 / FPS;
        setze(v.currentTime + (e.key === 'ArrowLeft' ? -schritt : schritt));
      } else if (k === 'c') {
        v.pause();
        ref.current.onKommentar?.();
      } else if (k === 'i') {
        ref.current.onAnfang?.(v.currentTime);
      } else if (k === 'o') {
        ref.current.onEnde?.(v.currentTime);
      } else if (k === 'f') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void v.requestFullscreen?.();
      }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [player, aktiv]);
}
