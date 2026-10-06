'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { ansehenLink, wannText, type LiveBewerber } from '@/lib/live/bewerber';

const SPEICHER = 'live-bewerber-seit';
const INTERVALL = 20_000;
const MAX_KARTEN = 3;

type Karte = LiveBewerber & { raus?: boolean };

function gespeichertesSeit(): string | null {
  try {
    return window.localStorage.getItem(SPEICHER);
  } catch {
    return null;
  }
}

function speichereSeit(v: string) {
  try {
    window.localStorage.setItem(SPEICHER, v);
  } catch {
    /* privater Modus o. Ä. – dann eben ohne Merken */
  }
}

/**
 * Live-Hinweis unten links: neuer Bewerber mit Kunde, Name, Quelle und Stelle.
 * Fragt alle 20 Sekunden nach (pausiert, solange der Tab im Hintergrund ist).
 */
export function NeueBewerber({ role, funktion }: { role: string; funktion?: string | null }) {
  const [karten, setKarten] = useState<Karte[]>([]);
  const [jetzt, setJetzt] = useState(0);
  const seitRef = useRef<string | null>(null);
  const gezeigt = useRef(new Set<string>());

  const abrufen = useCallback(async () => {
    // Nie ältere Bewerber als den letzten Abruf (auch aus anderen Tabs) zeigen
    const gespeichert = gespeichertesSeit();
    const seit = [seitRef.current, gespeichert].filter((x): x is string => !!x).sort().pop() ?? new Date().toISOString();
    try {
      const res = await fetch(`/api/live/bewerber?seit=${encodeURIComponent(seit)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const d = (await res.json()) as { bewerber: LiveBewerber[]; jetzt: string };
      seitRef.current = d.jetzt;
      speichereSeit(d.jetzt);
      setJetzt(Date.now());
      const neu = d.bewerber.filter((b) => !gezeigt.current.has(b.id));
      if (!neu.length) return;
      neu.forEach((b) => gezeigt.current.add(b.id));
      // neueste oben, höchstens drei sichtbar
      setKarten((alt) => [...[...neu].reverse(), ...alt].slice(0, MAX_KARTEN));
    } catch {
      /* Netzwerk kurz weg – nächster Versuch in 20 s */
    }
  }, []);

  useEffect(() => {
    // Beim Start nur Bewerber ab jetzt zeigen
    const start = new Date().toISOString();
    const gespeichert = gespeichertesSeit();
    seitRef.current = gespeichert && gespeichert > start ? gespeichert : start;

    let timer: ReturnType<typeof setInterval> | null = null;
    const starte = () => {
      if (timer) return;
      timer = setInterval(() => void abrufen(), INTERVALL);
    };
    const stoppe = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const sichtbar = () => {
      if (document.hidden) stoppe();
      else {
        void abrufen();
        starte();
      }
    };
    if (!document.hidden) starte();
    document.addEventListener('visibilitychange', sichtbar);
    return () => {
      stoppe();
      document.removeEventListener('visibilitychange', sichtbar);
    };
  }, [abrufen]);

  const schliessen = (id: string) => setKarten((k) => k.map((x) => (x.id === id ? { ...x, raus: true } : x)));
  const entfernen = (id: string) => setKarten((k) => k.filter((x) => x.id !== id));

  if (!karten.length) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-[10px] bottom-[96px] z-[45] flex flex-col gap-2.5 md:inset-x-auto md:bottom-4 md:left-4 md:w-[380px]"
    >
      {karten.map((b) => (
        <LiveKarte
          key={b.id}
          b={b}
          jetzt={jetzt}
          href={ansehenLink(b, { role, funktion })}
          onClose={() => schliessen(b.id)}
          onGone={() => entfernen(b.id)}
        />
      ))}
    </div>
  );
}

function LiveKarte({ b, jetzt, href, onClose, onGone }: { b: Karte; jetzt: number; href: string; onClose: () => void; onGone: () => void }) {
  const chips = [b.quelle, b.stelle].filter((x): x is string => !!x);
  return (
    <div
      role="status"
      onAnimationEnd={(e) => {
        if (e.animationName === 'fx-live-out') onGone();
      }}
      className={`fx-live-card group pointer-events-auto relative overflow-hidden rounded-[20px] bg-card p-4 shadow-[0_0_0_1px_var(--hair),0_24px_50px_-20px_#1a151480] ${
        b.raus ? 'fx-live-out' : 'fx-live-in'
      }`}
    >
      {/* einmaliger Glanz beim Eintreffen */}
      <span aria-hidden="true" className="fx-live-shimmer pointer-events-none absolute inset-0" />

      <div className="relative flex items-start gap-3">
        <span className="relative flex-none">
          <Avatar name={b.agency.name} src={b.agency.logo_url} size={46} />
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-green-500 shadow-[0_0_0_2px_var(--card)]" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium text-red-800">
            Neuer Bewerber · <span className="text-gray-600">{b.agency.name}</span>
          </p>
          <p className="mt-0.5 truncate text-[18px] font-semibold leading-tight tracking-[-0.02em] text-ink">{b.name}</p>
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c} className="max-w-full truncate rounded-full bg-panel px-2.5 py-0.5 text-[12px] font-medium text-gray-700">
                  {c}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[12px] text-gray-500">{jetzt ? wannText(b.created_at, jetzt) : 'gerade eben'}</span>
            <a
              href={href}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-red-700 to-red-950 px-3.5 py-1.5 text-[13px] font-medium text-red-50 transition-transform hover:-translate-y-0.5"
            >
              Ansehen <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hinweis schließen"
          className="-mr-1 -mt-1 grid h-8 w-8 flex-none place-items-center rounded-full text-gray-500 hover:bg-panel hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* läuft 15 s ab, pausiert beim Drüberfahren – danach verschwindet die Karte */}
      {!b.raus && (
        <span
          aria-hidden="true"
          onAnimationEnd={(e) => {
            e.stopPropagation();
            if (e.animationName === 'fx-live-timer') onClose();
          }}
          className="fx-live-timer absolute inset-x-0 bottom-0 h-[3px] origin-left bg-gradient-to-r from-red-700 to-red-400 group-hover:[animation-play-state:paused]"
        />
      )}
    </div>
  );
}
