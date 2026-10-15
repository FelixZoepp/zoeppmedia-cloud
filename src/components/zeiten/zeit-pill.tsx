'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Square, Timer } from 'lucide-react';
import { dauerFormat, MAX_LAUF_MINUTEN, minutenZwischen, taetigkeitLabel } from '@/lib/zeiten/rechnen';

/** Nach Änderungen an Zeiten auslösen, damit die Anzeige im Kopf sofort stimmt */
export const ZEITEN_EVENT = 'zeiten:geaendert';

interface Laufend {
  id: string;
  start: string;
  taetigkeit: string;
  kunde: string | null;
}

/** Laufende Stoppuhr im Kopf – damit niemand vergisst zu stoppen. Ohne laufende Stoppuhr unsichtbar. */
export function ZeitPill() {
  const [laufend, setLaufend] = useState<Laufend | null>(null);
  const [jetzt, setJetzt] = useState(() => Date.now());
  const [stoppt, setStoppt] = useState(false);

  const laden = useCallback(() => {
    fetch('/api/zeiten/laufend', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { laufend: Laufend | null } | null) => setLaufend(d?.laufend ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    laden();
    const neu = () => laden();
    const sichtbar = () => document.visibilityState === 'visible' && laden();
    window.addEventListener(ZEITEN_EVENT, neu);
    document.addEventListener('visibilitychange', sichtbar);
    return () => {
      window.removeEventListener(ZEITEN_EVENT, neu);
      document.removeEventListener('visibilitychange', sichtbar);
    };
  }, [laden]);

  useEffect(() => {
    if (!laufend) return;
    const t = setInterval(() => setJetzt(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [laufend]);

  if (!laufend) return null;
  const min = minutenZwischen(laufend.start, new Date(Math.max(jetzt, Date.parse(laufend.start))));
  const zuLang = min > MAX_LAUF_MINUTEN;

  async function stoppen() {
    setStoppt(true);
    await fetch('/api/zeiten/laufend', { method: 'POST' }).catch(() => {});
    setStoppt(false);
    setLaufend(null);
    window.dispatchEvent(new Event(ZEITEN_EVENT));
  }

  return (
    <div
      className={`flex min-w-0 items-center gap-1 rounded-full py-1 pl-3 pr-1 text-[13px] font-medium ${
        zuLang ? 'bg-amber-50 text-amber-800 shadow-[inset_0_0_0_1px_#fcd34d]' : 'bg-red-50 text-red-800 shadow-[inset_0_0_0_1px_var(--r-100)]'
      }`}
    >
      <Link href="/zeiten" className="flex min-w-0 items-center gap-1.5" title={zuLang ? 'Läuft über 10 Stunden – bitte prüfen' : 'Zur Zeiterfassung'}>
        <Timer className="h-4 w-4 flex-none animate-pulse" />
        <span className="tabular-nums">{dauerFormat(min)}</span>
        <span className="hidden max-w-[180px] truncate text-[12.5px] opacity-80 sm:inline">
          {laufend.kunde ?? 'Intern'} · {taetigkeitLabel(laufend.taetigkeit)}
        </span>
      </Link>
      <button
        type="button"
        onClick={stoppen}
        disabled={stoppt}
        className="ml-1 grid h-7 w-7 flex-none place-items-center rounded-full bg-card text-current hover:bg-white disabled:opacity-50"
        aria-label="Stoppuhr stoppen"
        title="Stopp"
      >
        <Square className="h-3.5 w-3.5 fill-current" />
      </button>
    </div>
  );
}
