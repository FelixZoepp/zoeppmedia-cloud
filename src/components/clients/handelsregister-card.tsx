'use client';

import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { Card } from '@/components/ui';

interface Stand {
  dateiname: string | null;
  am: string | null;
  url: string | null;
  firma: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
}

/** Firmensitz + Handelsregisterauszug aus dem Onboarding (Grundlage für die eigene Festnetznummer) */
export function HandelsregisterCard({ agencyId }: { agencyId: string }) {
  const [s, setS] = useState<Stand | null>(null);

  useEffect(() => {
    let aktiv = true;
    fetch(`/api/onboarding/handelsregister?agencyId=${agencyId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => aktiv && setS(d))
      .catch(() => {});
    return () => {
      aktiv = false;
    };
  }, [agencyId]);

  const adresse = s && [s.strasse, [s.plz, s.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return (
    <Card className="mb-6">
      <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
        <FileText className="h-5 w-5 text-red-800" /> Firmensitz & Handelsregister
      </h2>
      <p className="mt-1 text-[13.5px] text-gray-600">Aus dem Onboarding – für die Anmeldung der eigenen Festnetznummer.</p>
      <dl className="mt-3 grid grid-cols-[140px_1fr] gap-y-1.5 text-[13.5px]">
        <dt className="text-gray-500">Firmensitz</dt>
        <dd>{adresse || <span className="text-amber-700">noch nicht angegeben</span>}</dd>
        <dt className="text-gray-500">Auszug</dt>
        <dd>
          {s?.url ? (
            <a href={s.url} target="_blank" rel="noreferrer" className="text-red-800 underline">
              {s.dateiname}
            </a>
          ) : (
            <span className="text-amber-700">noch nicht hochgeladen</span>
          )}
          {s?.am && <span className="ml-2 text-gray-400">({new Date(s.am).toLocaleDateString('de-DE')})</span>}
        </dd>
      </dl>
    </Card>
  );
}
