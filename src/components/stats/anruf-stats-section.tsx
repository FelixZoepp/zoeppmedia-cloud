'use client';

import { useEffect, useState } from 'react';
import { PhoneCall } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { dauerText, type AnrufStats } from '@/lib/kpi/anruf-stats';

const pct = (v: number | null) => (v === null ? '–' : `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`);

/** Balkenfarbe je Ergebnis */
const FARBE: Record<string, string> = {
  termin_vereinbart: 'bg-green-600',
  rueckruf: 'bg-sky-600',
  kein_interesse: 'bg-amber-500',
  sonstiges: 'bg-gray-500',
  nicht_erreicht: 'bg-red-700',
  falsche_nummer: 'bg-red-300',
};

/** Anruf-Kennzahlen für die Statistik-Seite (eigener Abruf, gleicher Zeitraum wie die Seite) */
export function AnrufStatsSection({ zeitraum }: { zeitraum: '7' | '30' | '90' }) {
  const [d, setD] = useState<AnrufStats | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const to = new Date().toISOString().slice(0, 10);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(zeitraum, 10));
    const from = fromDate.toISOString().slice(0, 10);
    fetch(`/api/recruiting-stats/anrufe?from=${from}&to=${to}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => setD(x))
      .catch(() => {});
    return () => ctrl.abort();
  }, [zeitraum]);

  if (!d) return null;
  const max = Math.max(1, ...d.proErgebnis.map((e) => e.anzahl));

  return (
    <Card padding="md">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <PhoneCall className="h-4 w-4 text-red-800" /> Anrufe
      </h2>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: 'Anrufe', v: d.gesamt.toLocaleString('de-DE'), s: `${d.erreicht} erreicht · ${d.termine} Termine` },
          { l: 'Erreichbarkeit', v: pct(d.erreichbarkeit), s: 'erreicht ÷ alle Anrufe' },
          { l: 'Speed-to-Lead', v: dauerText(d.speedToLeadSek), s: d.speedToLeadAnzahl ? `Ø bei ${d.speedToLeadAnzahl} Bewerbern` : 'noch kein Erstkontakt' },
          { l: 'No-Show-Quote', v: pct(d.noShowQuote), s: `${d.noShows} von ${d.termineVergangen} vergangenen Terminen` },
        ].map((k) => (
          <div key={k.l} className="rounded-[16px] bg-panel p-3.5">
            <p className="text-[12.5px] text-gray-600">{k.l}</p>
            <p className="mt-1 text-[22px] font-semibold leading-none tracking-[-0.03em]">{k.v}</p>
            <p className="mt-1.5 text-[12px] text-gray-500">{k.s}</p>
          </div>
        ))}
      </div>

      {d.gesamt === 0 ? (
        <p className="mt-4 text-[13.5px] text-gray-500">Im Zeitraum wurden noch keine Anrufe protokolliert.</p>
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <p className="mb-2 text-[13px] font-medium text-gray-600">Ergebnisse</p>
            <ul className="space-y-2">
              {d.proErgebnis.map((e) => (
                <li key={e.ergebnis} className="flex items-center gap-3 text-[13.5px]">
                  <span className="w-32 flex-none truncate sm:w-36">{e.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full ${FARBE[e.ergebnis] ?? 'bg-gray-500'}`} style={{ width: `${(e.anzahl / max) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right font-semibold">{e.anzahl}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-[13px] font-medium text-gray-600">Je Person</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <th className="py-2 pr-3 text-left">Person</th>
                    <th className="px-3 py-2 text-right">Anrufe</th>
                    <th className="px-3 py-2 text-right">Erreicht</th>
                    <th className="px-3 py-2 text-right">Quote</th>
                    <th className="py-2 pl-3 text-right">Termine</th>
                  </tr>
                </thead>
                <tbody>
                  {d.proPerson.map((p) => (
                    <tr key={p.user_id ?? 'ohne'} className="border-b border-gray-50">
                      <td className="max-w-[160px] truncate py-2 pr-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-3 py-2 text-right">{p.gesamt}</td>
                      <td className="px-3 py-2 text-right">{p.erreicht}</td>
                      <td className="px-3 py-2 text-right">{pct(p.erreichbarkeit)}</td>
                      <td className="py-2 pl-3 text-right font-semibold">{p.termine}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
