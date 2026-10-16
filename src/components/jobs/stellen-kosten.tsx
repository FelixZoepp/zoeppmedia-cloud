'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { KostenZeile, MetaStatus } from '@/lib/kosten/stellen';
import { KampagnenZuordnung } from '@/components/kosten/kampagnen-zuordnung';
import { KostenKacheln, META_TEXT, eur } from '@/components/kosten/kosten-kacheln';

interface Daten {
  tage: number;
  stelle: KostenZeile | null;
  gesamt: KostenZeile;
  meta: MetaStatus;
  agencyId: string;
  intern: boolean;
}

/** Stellen-Einstellungen: „Kosten & Kanäle“ – echte Meta-/Indeed-Kosten dieser Stelle (letzte 30 Tage) */
export function StellenKosten({ jobId }: { jobId: string }) {
  const [d, setD] = useState<Daten | null>(null);

  const laden = useCallback(async () => {
    const r = await fetch(`/api/jobs/${jobId}/kosten?tage=30`, { cache: 'no-store' });
    if (r.ok) setD(await r.json());
  }, [jobId]);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  if (!d) return null;
  const hinweis = META_TEXT[d.meta];

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900">Kosten & Kanäle</h3>
        <p className="mt-0.5 text-xs text-gray-500">Letzte {d.tage} Tage · Meta-Kampagnen dieser Stelle + Indeed-Budget der Stelle</p>
      </div>
      {hinweis && <p className="mb-3 text-xs text-amber-700">{hinweis}</p>}
      {d.stelle ? <KostenKacheln z={d.stelle} /> : <p className="text-sm text-gray-500">Noch keine Daten.</p>}
      <p className="mt-2 text-[11px] text-gray-500">
        Ganzes Unternehmen: {eur(d.gesamt.kosten)} Werbekosten · {eur(d.gesamt.kostenProBewerber)} pro Bewerber
      </p>

      {d.intern && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Meta-Kampagnen dieser Stelle (nur intern)</p>
          <KampagnenZuordnung agencyId={d.agencyId} jobId={jobId} onGeaendert={laden} />
          <p className="mt-3 text-[11px] text-gray-400">
            Indeed-Tagesbudget für diese Stelle: <Link href={`/clients/${d.agencyId}/integrationen`} className="underline">Kundenakte → Integrationen</Link>
          </p>
        </div>
      )}
    </Card>
  );
}
