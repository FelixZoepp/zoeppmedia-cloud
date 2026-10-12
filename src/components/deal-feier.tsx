'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Deal-Feier in der Cloud: fragt alle 20 s nach neuen gewonnenen Deals (nur bei sichtbarem Tab)
 * und zeigt dann Konfetti + GIF + „DEAL!“ im Vollbild. Schließt nach 9 s oder per Klick.
 */

interface Feier {
  id: string;
  firma: string | null;
  closer: string | null;
  volumen: number | null;
  gif: string;
  created_at: string;
}

const FARBEN = ['#dc2626', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#facc15'];
// Feste Konfetti-Verteilung (kein Zufall im Render)
const KONFETTI = Array.from({ length: 70 }, (_, i) => ({
  links: (i * 37) % 100,
  verzoegerung: ((i * 13) % 20) / 10,
  dauer: 2.6 + ((i * 7) % 15) / 10,
  farbe: FARBEN[i % FARBEN.length],
  breite: 6 + (i % 4) * 2,
  dreh: (i * 47) % 360,
}));

const SPEICHER = 'zm_deal_feier_seit';

function gifPfad(url: string): string {
  // In der Cloud selbst den lokalen Pfad nutzen (Slack braucht die volle URL)
  return url.replace(/^https:\/\/cloud\.zoeppmedia\.de/, '');
}

export function DealFeier() {
  const [feier, setFeier] = useState<Feier | null>(null);
  const warteschlange = useRef<Feier[]>([]);
  const seit = useRef<string>(new Date().toISOString());

  useEffect(() => {
    try {
      const s = localStorage.getItem(SPEICHER);
      if (s) seit.current = s;
    } catch {
      /* ohne Speicher: ab jetzt */
    }
    let aus = false;
    const zeigeNaechste = () => setFeier((aktuell) => aktuell ?? warteschlange.current.shift() ?? null);
    const abfragen = async () => {
      if (aus || document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`/api/deal-feier?seit=${encodeURIComponent(seit.current)}`, { cache: 'no-store' });
        if (!r.ok) return;
        const d = (await r.json()) as { feiern: Feier[]; jetzt: string };
        const letzte = d.feiern[d.feiern.length - 1];
        seit.current = letzte?.created_at ?? d.jetzt;
        try {
          localStorage.setItem(SPEICHER, seit.current);
        } catch {
          /* egal */
        }
        if (d.feiern.length) {
          warteschlange.current.push(...d.feiern);
          zeigeNaechste();
        }
      } catch {
        /* nächster Versuch */
      }
    };
    const start = setTimeout(abfragen, 1500);
    const takt = setInterval(abfragen, 20_000);
    const sichtbar = () => document.visibilityState === 'visible' && abfragen();
    document.addEventListener('visibilitychange', sichtbar);
    return () => {
      aus = true;
      clearTimeout(start);
      clearInterval(takt);
      document.removeEventListener('visibilitychange', sichtbar);
    };
  }, []);

  useEffect(() => {
    if (!feier) return;
    const t = setTimeout(() => setFeier(warteschlange.current.shift() ?? null), 9000);
    return () => clearTimeout(t);
  }, [feier]);

  if (!feier) return null;
  const volumen = feier.volumen ? Number(feier.volumen).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : null;

  return (
    <div
      role="dialog"
      aria-label="Deal gewonnen"
      onClick={() => setFeier(warteschlange.current.shift() ?? null)}
      className="fixed inset-0 z-[2147483000] flex cursor-pointer items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      style={{ animation: 'zm-feier-ein 0.35s ease both' }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {KONFETTI.map((k, i) => (
          <span
            key={i}
            className="absolute top-[-20px] block rounded-[2px]"
            style={{
              left: `${k.links}%`,
              width: k.breite,
              height: k.breite * 1.6,
              background: k.farbe,
              transform: `rotate(${k.dreh}deg)`,
              animation: `zm-konfetti ${k.dauer}s linear ${k.verzoegerung}s infinite`,
            }}
          />
        ))}
      </div>
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white text-center shadow-2xl" style={{ animation: 'zm-feier-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) both' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- animiertes GIF */}
        <img src={gifPfad(feier.gif)} alt="" className="h-64 w-full object-cover" />
        <div className="space-y-1 p-5">
          <p className="text-3xl font-extrabold tracking-tight text-gray-900">🎉 DEAL! 🎉</p>
          <p className="text-base text-gray-700">
            <b>{feier.closer ?? 'Das Team'}</b> hat <b>{feier.firma ?? 'einen neuen Kunden'}</b> abgeschlossen
          </p>
          {volumen && <p className="text-2xl font-bold text-red-600">💰 {volumen}</p>}
          <p className="pt-1 text-xs text-gray-400">Klicken zum Schließen</p>
        </div>
      </div>
    </div>
  );
}
