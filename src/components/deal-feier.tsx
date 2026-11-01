'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Deal-Feier in der Cloud: fragt alle 20 s nach neuen gewonnenen Deals (nur bei sichtbarem Tab)
 * und zeigt dann Konfetti + GIF + „DEAL!“ im Vollbild. Schließt nach 9 s oder per Klick.
 */

interface Feier {
  id: string;
  created_at: string;
  gif?: string | null;
}

interface DealFeierDaten extends Feier {
  firma: string | null;
  closer: string | null;
  volumen: number | null;
  gif: string;
}

export interface EinstellungFeierDaten extends Feier {
  kunde: string | null;
  vorname: string | null;
  stelle: string | null;
  nr_kunde: number | null;
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

/** IDs bereits gezeigter Feiern (jede Feier nur einmal je Gerät) */
function gesehen(schluessel: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(schluessel) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function gifPfad(url: string): string {
  // In der Cloud selbst den lokalen Pfad nutzen (Slack braucht die volle URL)
  return url.replace(/^https:\/\/cloud\.zoeppmedia\.de/, '');
}

/**
 * Allgemeine Feier-Anzeige: fragt `url` alle 20 s nach neuen Feiern (Antwort { feiern, jetzt })
 * und zeigt jede genau einmal je Gerät im Vollbild mit Konfetti.
 */
function FeierAnzeige<T extends Feier>({ url, name, label, inhalt }: { url: string; name: string; label: string; inhalt: (f: T) => ReactNode }) {
  const SPEICHER = `zm_${name}_seit`;
  const GESEHEN = `zm_${name}_gesehen`;
  const [feier, setFeier] = useState<T | null>(null);
  const warteschlange = useRef<T[]>([]);
  const seit = useRef<string>(new Date().toISOString());

  useEffect(() => {
    try {
      const s = localStorage.getItem(SPEICHER);
      if (s) seit.current = s;
    } catch {
      /* ohne Speicher: ab jetzt */
    }
    let aus = false;
    let laeuft = false;
    const zeigeNaechste = () => setFeier((aktuell) => aktuell ?? warteschlange.current.shift() ?? null);
    const abfragen = async () => {
      if (aus || laeuft || document.visibilityState !== 'visible') return;
      laeuft = true;
      try {
        const r = await fetch(`${url}?seit=${encodeURIComponent(seit.current)}`, { cache: 'no-store' });
        if (!r.ok) return;
        const d = (await r.json()) as { feiern: T[]; jetzt: string };
        const letzte = d.feiern[d.feiern.length - 1];
        seit.current = letzte?.created_at ?? d.jetzt;
        try {
          localStorage.setItem(SPEICHER, seit.current);
        } catch {
          /* egal */
        }
        const schon = new Set([...gesehen(GESEHEN), ...warteschlange.current.map((f) => f.id)]);
        const neu = d.feiern.filter((f) => !schon.has(f.id));
        if (neu.length) {
          try {
            localStorage.setItem(GESEHEN, JSON.stringify([...gesehen(GESEHEN), ...neu.map((f) => f.id)].slice(-30)));
          } catch {
            /* egal */
          }
          warteschlange.current.push(...neu);
          zeigeNaechste();
        }
      } catch {
        /* nächster Versuch */
      } finally {
        laeuft = false;
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
  }, [url, SPEICHER, GESEHEN]);

  useEffect(() => {
    if (!feier) return;
    const t = setTimeout(() => setFeier(warteschlange.current.shift() ?? null), 9000);
    return () => clearTimeout(t);
  }, [feier]);

  if (!feier) return null;

  return (
    <div
      role="dialog"
      aria-label={label}
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
        <img src={gifPfad(feier.gif ?? '/icons/deal-feier.gif')} alt="" className="h-64 w-full object-cover" />
        <div className="space-y-1 p-5">
          {inhalt(feier)}
          <p className="pt-1 text-xs text-gray-400">Klicken zum Schließen</p>
        </div>
      </div>
    </div>
  );
}

/** Deal gewonnen – bei allen eingeloggten Mitarbeitern */
export function DealFeier() {
  return (
    <FeierAnzeige<DealFeierDaten>
      url="/api/deal-feier"
      name="deal_feier"
      label="Deal gewonnen"
      inhalt={(f) => {
        const volumen = f.volumen ? Number(f.volumen).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : null;
        return (
          <>
            <p className="text-3xl font-extrabold tracking-tight text-gray-900">🎉 DEAL! 🎉</p>
            <p className="text-base text-gray-700">
              <b>{f.closer ?? 'Das Team'}</b> hat <b>{f.firma ?? 'einen neuen Kunden'}</b> abgeschlossen
            </p>
            {volumen && <p className="text-2xl font-bold text-red-600">💰 {volumen}</p>}
          </>
        );
      }}
    />
  );
}

/** Neue Einstellung – beim Kunden (eigene) und intern (alle) */
export function EinstellungFeier({ intern = false }: { intern?: boolean }) {
  return (
    <FeierAnzeige<EinstellungFeierDaten>
      url="/api/einstellung-feier"
      name="einstellung_feier"
      label="Neue Einstellung"
      inhalt={(f) => (
        <>
          <p className="text-3xl font-extrabold tracking-tight text-gray-900">🎉 EINGESTELLT! 🎉</p>
          <p className="text-base text-gray-700">
            {intern ? (
              <>
                <b>{f.kunde ?? 'Ein Kunde'}</b> hat <b>{f.vorname ?? 'einen neuen Mitarbeiter'}</b> eingestellt
              </>
            ) : (
              <>
                Glückwunsch zu <b>{f.vorname ?? 'deinem neuen Mitarbeiter'}</b>!
              </>
            )}
            {f.stelle ? <> als <b>{f.stelle}</b></> : null}
          </p>
          {f.nr_kunde ? <p className="text-xl font-bold text-red-600">🏆 Einstellung Nr. {f.nr_kunde}</p> : null}
        </>
      )}
    />
  );
}
