'use client';

/** Kundenakte → Bilder: alles, was der Kunde unter „Bilder & Branding“ hochgeladen hat, nach Kategorie */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui';
import { KATEGORIEN, type BildKategorie } from '@/lib/kunden-bilder-kategorien';

type Bild = { id: string; kategorie: BildKategorie; dateiname: string | null; created_at: string; url: string | null };

export function BilderClient({ agencyId }: { agencyId: string }) {
  const [bilder, setBilder] = useState<Bild[] | null>(null);

  useEffect(() => {
    fetch(`/api/kunden-bilder?agencyId=${agencyId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { bilder: [] }))
      .then((d: { bilder: Bild[] }) => setBilder(d.bilder))
      .catch(() => setBilder([]));
  }, [agencyId]);

  return (
    <div className="max-w-5xl">
      <Link href={`/clients/${agencyId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Zur Kundenakte
      </Link>
      <PageHeader label="KUNDEN" title="Bilder vom Kunden" description="Hochgeladen unter „Deine Aufgaben → Bilder & Branding“. Links gelten eine Stunde – bei Bedarf Seite neu laden." />
      {bilder === null ? (
        <p className="text-sm text-gray-500">Lädt…</p>
      ) : bilder.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-600">Noch keine Bilder hochgeladen.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {(Object.keys(KATEGORIEN) as BildKategorie[]).map((k) => {
            const liste = bilder.filter((b) => b.kategorie === k);
            return (
              <Card key={k}>
                <p className="mb-3 font-semibold text-gray-900">
                  {KATEGORIEN[k].titel} <span className="font-normal text-gray-500">({liste.length})</span>
                </p>
                {liste.length === 0 ? (
                  <p className={`text-sm ${k === 'ich' ? 'font-medium text-amber-700' : 'text-gray-500'}`}>{k === 'ich' ? 'Noch keine Fotos vom Kunden selbst – bitte nachfordern.' : 'Keine.'}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {liste.map((b) => (
                      <a key={b.id} href={b.url ?? '#'} target="_blank" rel="noreferrer" download={b.dateiname ?? undefined} className="group block overflow-hidden rounded-lg border border-gray-200">
                        {b.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={b.url} alt={b.dateiname ?? ''} className="aspect-square w-full object-cover" />
                        ) : (
                          <div className="flex aspect-square items-center justify-center bg-gray-100 text-xs text-gray-500">Keine Vorschau</div>
                        )}
                        <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] text-gray-600">
                          <span className="truncate">{b.dateiname ?? 'Bild'}</span>
                          <Download className="h-3.5 w-3.5 flex-none" />
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
