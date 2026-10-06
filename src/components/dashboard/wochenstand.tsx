'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import type { KundenUeberblick } from '@/lib/wochenbericht/berechnung';

/** Wochenüberblick der letzten 7 Tage – neutral, derselbe Inhalt wie die E-Mail am Montag */
export function Wochenstand() {
  const [b, setB] = useState<KundenUeberblick | null>(null);

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

  if (!b || !b.kunde.kennzahlen.length) return null;
  const schritte = [...b.kunde.naechsteSchritte, ...b.deineAufgaben];
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[19px] font-medium tracking-[-0.02em]">Dein Wochenüberblick</h2>
        <span className="text-[13px] text-gray-500">Letzte 7 Tage · {b.zeitraum}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {b.kunde.kennzahlen.map((k) => (
          <div key={k.label} className="min-w-0">
            <dt className="truncate text-[12.5px] text-gray-500">{k.label}</dt>
            <dd className="text-[17px] font-semibold text-ink">
              {k.wert}
              {k.vorwoche && <span className="ml-1.5 text-[12px] font-medium text-green-700">{k.vorwoche}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {schritte.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-[13px] font-semibold text-gray-700">Deine nächsten Schritte</p>
          <ul className="mt-1.5 space-y-1">
            {schritte.map((s, i) => (
              <li key={i} className="text-[14px] leading-snug text-gray-700">• {s}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
