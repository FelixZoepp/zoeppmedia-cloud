'use client';

import { Card } from '@/components/ui/card';
import type { KpiFormat, KpiStatus } from '@/lib/finanzen/kpis';

const fmt = (v: number | null, f: KpiFormat) => {
  if (v == null) return '–';
  if (f === 'euro') return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
  if (f === 'prozent') return `${Math.round(v * 1000) / 10} %`;
  if (f === 'tage') return `${Math.round(v)} Tage`;
  return String(Math.round(v * 10) / 10);
};
const PUNKT: Record<KpiStatus['status'], string> = { gut: '🟢', knapp: '🟡', schlecht: '🔴', offen: '⚪' };

/** Alle KPIs mit Ist/Ziel/Status – Vorschläge zuerst für die schlechtesten */
export function KpiUebersicht({ kpis }: { kpis: KpiStatus[] }) {
  const bereiche = [...new Set(kpis.map((k) => k.bereich))];
  const baustellen = kpis.filter((k) => k.status === 'schlecht' || k.status === 'knapp').sort((a, b) => (a.status === b.status ? 0 : a.status === 'schlecht' ? -1 : 1));
  const zaehl = (s: KpiStatus['status']) => kpis.filter((k) => k.status === s).length;

  return (
    <Card padding="none" className="mb-6 overflow-hidden">
      <div className="border-b border-gray-200 px-5 py-3">
        <p className="text-sm font-semibold text-gray-900">KPI-Übersicht & Optimierung</p>
        <p className="text-xs text-gray-500">
          {PUNKT.gut} {zaehl('gut')} im Ziel · {PUNKT.knapp} {zaehl('knapp')} knapp · {PUNKT.schlecht} {zaehl('schlecht')} daneben · {PUNKT.offen} {zaehl('offen')} ohne Daten
        </p>
      </div>
      {baustellen.length > 0 && (
        <div className="border-b border-gray-100 bg-amber-50/60 px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-800">Was du als Nächstes optimieren solltest</p>
          <ol className="space-y-2 text-sm">
            {baustellen.slice(0, 6).map((k, i) => (
              <li key={k.name} className="text-gray-800">
                <span className="font-semibold">
                  {i + 1}. {k.name}: {fmt(k.ist, k.format)}
                </span>
                <span className="text-gray-500"> (Ziel {k.hoeherBesser ? '≥' : '≤'} {fmt(k.ziel, k.format)})</span>
                <span className="block text-gray-700">→ {k.tipp}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="grid grid-cols-1 gap-0 divide-y divide-gray-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        {bereiche.map((b) => (
          <div key={b} className="px-5 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{b}</p>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {kpis
                  .filter((k) => k.bereich === b)
                  .map((k) => (
                    <tr key={k.name} title={k.status === 'gut' ? '' : k.tipp}>
                      <td className="py-1.5 pr-2">{PUNKT[k.status]}</td>
                      <td className="py-1.5 text-gray-800">{k.name}</td>
                      <td className="py-1.5 text-right font-semibold text-gray-900">{fmt(k.ist, k.format)}</td>
                      <td className="py-1.5 pl-2 text-right text-xs text-gray-500">
                        {k.hoeherBesser ? '≥' : '≤'} {fmt(k.ziel, k.format)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Card>
  );
}
