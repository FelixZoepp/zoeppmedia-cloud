'use client';

import { useEffect, useState } from 'react';
import { UserX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { AbsageAuswertung } from '@/components/stats/absage-stats-section';
import type { AbsageStats } from '@/lib/kpi/absage-stats';

interface Antwort {
  tage: number;
  gesamt: AbsageStats;
  proKunde: Array<{ agencyId: string; name: string; gesamt: number; ohneGrund: number; top: AbsageStats['proGrund'] }>;
}

const pct = (v: number) => `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })} %`;

/** Admin: Absagegründe über alle Kunden */
export function AbsageUebersicht() {
  const [tage, setTage] = useState(90);
  const [d, setD] = useState<Antwort | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/admin/absagegruende?tage=${tage}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => setD(x))
      .catch(() => {});
    return () => ctrl.abort();
  }, [tage]);

  return (
    <Card padding="md">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <UserX className="h-4 w-4 text-red-800" /> Absagegründe aller Kunden
        </h2>
        <div className="flex gap-1">
          {[30, 90, 180].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTage(t)}
              className={`rounded-full px-3 py-1 text-[12.5px] cursor-pointer ${tage === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {t} Tage
            </button>
          ))}
        </div>
      </div>
      {!d ? (
        <p className="text-[13.5px] text-gray-500">Lädt …</p>
      ) : (
        <div className="space-y-6">
          <AbsageAuswertung d={d.gesamt} mitListe={false} />
          {d.proKunde.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 pr-3 font-medium">Kunde</th>
                    <th className="py-2 pr-3 font-medium tabular-nums">Absagen</th>
                    <th className="py-2 font-medium">Häufigste Gründe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {d.proKunde.map((k) => (
                    <tr key={k.agencyId}>
                      <td className="py-2 pr-3 font-medium text-gray-900">{k.name}</td>
                      <td className="py-2 pr-3 tabular-nums text-gray-700">
                        {k.gesamt}
                        {k.ohneGrund > 0 && <span className="text-gray-400"> ({k.ohneGrund} ohne Grund)</span>}
                      </td>
                      <td className="py-2 text-gray-600">{k.top.map((g) => `${g.label} ${pct(g.anteil)}`).join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
