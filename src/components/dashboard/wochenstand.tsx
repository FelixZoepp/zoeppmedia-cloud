'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import type { BerichtStatus, Wochenbericht } from '@/lib/wochenbericht/berechnung';

const STATUS: Record<BerichtStatus, { label: string; pill: string; text: string }> = {
  auf_kurs: { label: 'Auf Kurs', pill: 'bg-green-700 text-white', text: 'text-green-800' },
  achtung: { label: 'Achtung', pill: 'bg-amber-600 text-white', text: 'text-amber-800' },
  kritisch: { label: 'Gegensteuern', pill: 'bg-red-700 text-white', text: 'text-red-800' },
};
const PUNKT = { ok: 'bg-green-600', gelb: 'bg-amber-500', rot: 'bg-red-600' } as const;

/** Bist du auf Kurs? Stand der letzten 7 Tage – derselbe Inhalt wie der Wochenbericht per E-Mail */
export function Wochenstand() {
  const [b, setB] = useState<Wochenbericht | null>(null);

  useEffect(() => {
    let aktiv = true;
    fetch('/api/wochenbericht', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => aktiv && d?.bericht && setB(d.bericht))
      .catch(() => {});
    return () => {
      aktiv = false;
    };
  }, []);

  if (!b) return null;
  const st = STATUS[b.status];
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${st.pill}`}>{st.label}</span>
        <span className="text-[13px] text-gray-500">Letzte 7 Tage · {b.zeitraum}</span>
      </div>
      <p className={`mt-2 text-[19px] font-medium tracking-[-0.02em] ${st.text}`}>{b.ueberschrift}</p>
      {b.punkte.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {b.punkte.map((p, i) => (
            <li key={i} className="flex gap-2.5 text-[14px] leading-snug text-gray-800">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PUNKT[p.stufe]}`} />
              {p.text}
            </li>
          ))}
        </ul>
      )}
      {b.deineAufgaben.length > 0 && (
        <p className="mt-3 text-[13.5px] text-gray-600">
          <strong className="font-semibold text-gray-800">Deine Aufgaben:</strong> {b.deineAufgaben.join(' · ')}
        </p>
      )}
    </Card>
  );
}
