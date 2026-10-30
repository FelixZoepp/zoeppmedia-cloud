'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { ChevronDown } from 'lucide-react';
import { KUENDIGUNGSGRUENDE, churnNachGrund, type KundeStatus } from '@/lib/finanzen/kundenhistorie';

const auswahl = 'rounded-md bg-transparent text-sm text-gray-700';
const jaNein = (v: boolean | null) => (v == null ? '' : v ? 'ja' : 'nein');
const ausJaNein = (s: string) => (s === '' ? null : s === 'ja');

/** Kundenhistorie Direktvertrieb: Upsell / Rückgewinnung / aktiv / Kündigungsgrund pflegen, Churn nach Grund */
export function Kundenhistorie({ geaendert }: { geaendert: () => void }) {
  const [kunden, setKunden] = useState<KundeStatus[] | null>(null);
  const [offen, setOffen] = useState(false);

  const laden = useCallback(async () => {
    const res = await fetch('/api/admin/finanzen/kunden-status', { cache: 'no-store' });
    if (res.ok) setKunden((await res.json()).kunden);
  }, []);

  useEffect(() => {
    let aktiv = true;
    fetch('/api/admin/finanzen/kunden-status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => aktiv && j && setKunden(j.kunden));
    return () => {
      aktiv = false;
    };
  }, []);

  async function speichern(k: KundeStatus, felder: Partial<KundeStatus>) {
    const res = await fetch(`/api/admin/finanzen/kunden-status/${k.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(felder) });
    if (!res.ok) return toast.error('Speichern fehlgeschlagen');
    await laden();
    geaendert();
  }

  if (!kunden) return null;
  const d2d = kunden.filter((k) => k.segment === 'd2d');
  const gruende = churnNachGrund(kunden);

  return (
    <Card padding="none" className="mb-6 overflow-hidden">
      <div className="border-b border-gray-200 px-5 py-3">
        <p className="text-sm font-semibold text-gray-900">Kundenhistorie Direktvertrieb – Churn nach Grund</p>
        <p className="text-xs text-gray-500">
          {d2d.filter((k) => k.aktiv).length} aktiv · {d2d.filter((k) => !k.aktiv).length} gekündigt/beendet · Upsell {d2d.filter((k) => k.upsell).length} von {d2d.filter((k) => k.upsell != null).length}
        </p>
      </div>
      {gruende.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-gray-100 px-5 py-3">
          {gruende.map((g) => (
            <span key={g.grund} className="rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-800" title={g.kunden.join(', ')}>
              <span className="font-semibold">{g.anzahl}×</span> {g.grund}
              <span className="text-xs text-gray-500"> · {g.kunden.slice(0, 3).join(', ')}{g.kunden.length > 3 ? ' …' : ''}</span>
            </span>
          ))}
        </div>
      )}
      <button className="flex w-full items-center justify-between px-5 py-3 text-left" onClick={() => setOffen(!offen)}>
        <span className="text-sm font-semibold text-gray-900">Kunden bewerten ({kunden.length})</span>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${offen ? 'rotate-180' : ''}`} />
      </button>
      {offen && (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-5 py-2 text-left">Kunde</th>
                <th className="px-3 py-2 text-left">Segment</th>
                <th className="px-3 py-2 text-left">Aktiv</th>
                <th className="px-3 py-2 text-left">Upsell</th>
                <th className="px-3 py-2 text-left">Rückgewinnung</th>
                <th className="px-3 py-2 text-left">Kündigungsgrund</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {kunden.map((k) => (
                <tr key={k.id} className={k.segment === 'raus' ? 'opacity-50' : ''}>
                  <td className="px-5 py-1.5 text-gray-900" title={k.notiz ?? ''}>
                    {k.kunde}
                  </td>
                  <td className="px-3 py-1.5">
                    <select className={auswahl} value={k.segment} onChange={(e) => speichern(k, { segment: e.target.value as KundeStatus['segment'] })}>
                      <option value="d2d">Direktvertrieb</option>
                      <option value="sonstige">Sonstige</option>
                      <option value="raus">Nicht zählen</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <select className={auswahl} value={k.aktiv ? 'ja' : 'nein'} onChange={(e) => speichern(k, { aktiv: e.target.value === 'ja' })}>
                      <option value="ja">aktiv</option>
                      <option value="nein">weg</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <select className={auswahl} value={jaNein(k.upsell)} onChange={(e) => speichern(k, { upsell: ausJaNein(e.target.value) })}>
                      <option value="">offen</option>
                      <option value="ja">ja</option>
                      <option value="nein">nein</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <select className={auswahl} value={jaNein(k.rueckgewinnung)} onChange={(e) => speichern(k, { rueckgewinnung: ausJaNein(e.target.value) })}>
                      <option value="">–</option>
                      <option value="ja">ja</option>
                      <option value="nein">nein</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    {k.aktiv ? (
                      <span className="text-xs text-gray-400">–</span>
                    ) : (
                      <select
                        className={auswahl}
                        value={k.kuendigungsgrund ?? ''}
                        onChange={(e) => speichern(k, { kuendigungsgrund: (e.target.value || null) as KundeStatus['kuendigungsgrund'] })}
                      >
                        <option value="">Grund offen</option>
                        {KUENDIGUNGSGRUENDE.map((g) => (
                          <option key={g}>{g}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
