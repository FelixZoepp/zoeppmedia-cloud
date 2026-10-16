'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { StellenKosten } from '@/lib/kosten/stellen';
import { KampagnenZuordnung } from '@/components/kosten/kampagnen-zuordnung';
import { KostenKacheln, META_TEXT, eur } from '@/components/kosten/kosten-kacheln';

const ZEITRAEUME = [30, 90];

/** Kundenakte: echte Werbekosten (Meta + Indeed) je Stelle und Kosten pro Bewerber/Termin/Einstellung */
export function StellenKostenCard({ agencyId }: { agencyId: string }) {
  const [tage, setTage] = useState(30);
  const [d, setD] = useState<StellenKosten | null>(null);

  const laden = useCallback(async () => {
    const r = await fetch(`/api/admin/agencies/${agencyId}/kosten?tage=${tage}`, { cache: 'no-store' });
    if (r.ok) setD(((await r.json()) as { kosten: StellenKosten }).kosten);
  }, [agencyId, tage]);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  const hinweis = d ? META_TEXT[d.meta] : null;
  const stellen = d?.stellen ?? [];

  return (
    <Card padding="lg" className="mb-6">
      <div className="mb-5 flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
          <Wallet className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-gray-900">Kosten je Stelle</h2>
          <p className="mt-0.5 text-xs text-gray-500">Meta-Ausgaben aus dem Werbekonto des Kunden + Indeed-Tagesbudget – Ergebnisse im selben Zeitraum</p>
        </div>
        <div className="flex gap-1">
          {ZEITRAEUME.map((t) => (
            <button
              key={t}
              onClick={() => setTage(t)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${tage === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {t} Tage
            </button>
          ))}
        </div>
      </div>

      {hinweis && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {hinweis}
          {d?.meta === 'kein_werbekonto' || d?.meta === 'kein_zugriff' ? (
            <>
              {' – '}
              <Link href={`/clients/${agencyId}/integrationen`} className="underline">Werbekonto unter Integrationen prüfen</Link>
            </>
          ) : null}
        </p>
      )}

      {d && (
        <>
          <KostenKacheln z={d.gesamt} />
          {(d.ohneStelle.meta > 0 || d.ohneStelle.indeed > 0) && (
            <p className="mt-2 text-[11px] text-gray-500">
              Ohne Stellen-Zuordnung: Meta {eur(d.ohneStelle.meta)}, Indeed {eur(d.ohneStelle.indeed)} – zählt nur im Gesamtwert.
            </p>
          )}

          {stellen.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="py-2 pr-3 font-medium">Stelle</th>
                    <th className="px-2 py-2 font-medium">Meta</th>
                    <th className="px-2 py-2 font-medium">Indeed</th>
                    <th className="px-2 py-2 font-medium">Bewerber</th>
                    <th className="px-2 py-2 font-medium">€/Bewerber</th>
                    <th className="px-2 py-2 font-medium">Termine</th>
                    <th className="px-2 py-2 font-medium">€/Termin</th>
                    <th className="px-2 py-2 font-medium">Einst.</th>
                    <th className="px-2 py-2 font-medium">€/Einst.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stellen.map((z) => (
                    <tr key={z.job_id}>
                      <td className="py-2 pr-3 text-gray-900">
                        {z.titel}
                        {z.kampagnen > 0 && <span className="ml-1 text-[11px] text-gray-400">({z.kampagnen} Kamp.)</span>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">{eur(z.metaKosten)}</td>
                      <td className="whitespace-nowrap px-2 py-2">{eur(z.indeedKosten)}</td>
                      <td className="px-2 py-2" title={`Meta ${z.bewerberQuelle.meta} · Indeed ${z.bewerberQuelle.indeed} · sonstige ${z.bewerberQuelle.sonstige}`}>{z.bewerber}</td>
                      <td className="whitespace-nowrap px-2 py-2 font-medium">{eur(z.kostenProBewerber)}</td>
                      <td className="px-2 py-2">{z.termine}</td>
                      <td className="whitespace-nowrap px-2 py-2">{eur(z.kostenProTermin)}</td>
                      <td className="px-2 py-2">{z.einstellungen}</td>
                      <td className="whitespace-nowrap px-2 py-2">{eur(z.kostenProEinstellung)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="mt-6 border-t border-gray-100 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Meta-Kampagnen → Stellen</p>
        <KampagnenZuordnung agencyId={agencyId} stellen={stellen.map((s) => ({ id: s.job_id!, title: s.titel }))} onGeaendert={laden} />
      </div>
    </Card>
  );
}
