'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, PauseCircle, Flag } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StepRow } from '@/components/fulfillment/step-row';
import { phaseLabel, type Phase } from '@/lib/fulfillment/catalog';
import type { StepView } from '@/lib/fulfillment/views';

interface AgencyAblauf {
  agency: { id: string; name: string; launch_datum: string | null; pausiert_grund: string | null } | null;
  phase: Phase;
  team: Array<{ id: string; name: string }>;
  phases: Array<{ key: Phase; label: string; farbe: string; beschreibung: string; schritte: StepView[] }>;
}

export default function AblaufPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<AgencyAblauf | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/fulfillment/agencies/${id}`);
    if (res.ok) setData(await res.json());
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/fulfillment/agencies/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const patchStep = async (stepId: string, patch: Record<string, unknown>) => {
    const res = await fetch(`/api/fulfillment/steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error('Konnte nicht gespeichert werden');
      return;
    }
    const { advancedTo } = (await res.json()) as { advancedTo: Phase | null };
    if (advancedTo) toast.success(`Phase abgeschlossen – weiter mit "${phaseLabel(advancedTo)}"`);
    await load();
  };

  const patchAgency = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/fulfillment/agencies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) toast.error('Konnte nicht gespeichert werden');
    await load();
  };

  if (!data?.agency) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  const currentIndex = data.phases.findIndex((p) => p.key === data.phase);

  return (
    <div>
      <Link href={`/clients/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-3">
        <ArrowLeft className="w-4 h-4" /> Zum Kunden
      </Link>
      <PageHeader
        label="ABLAUF"
        title={data.agency.name}
        counter={`Phase: ${phaseLabel(data.phase)}`}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => {
                const grund = window.prompt('Warum ist der Kunde pausiert? (leer = Pause aufheben)', data.agency?.pausiert_grund ?? '');
                if (grund !== null) void patchAgency({ pausiert_grund: grund });
              }}
              className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm inline-flex items-center gap-1.5 hover:bg-gray-50"
            >
              <PauseCircle className="w-4 h-4" /> {data.agency.pausiert_grund ? 'Pause bearbeiten' : 'Pausieren'}
            </button>
            {data.phase !== 'offboarding' && data.phase !== 'beendet' && (
              <button
                onClick={() => {
                  if (window.confirm(`Offboarding für ${data.agency?.name} starten?`)) void patchAgency({ phase: 'offboarding' });
                }}
                className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm inline-flex items-center gap-1.5 hover:bg-gray-50"
              >
                <Flag className="w-4 h-4" /> Offboarding starten
              </button>
            )}
          </div>
        }
      />

      {data.agency.pausiert_grund && (
        <Card padding="none" className="p-4 mb-4 bg-gray-50 text-sm text-gray-700 flex items-center gap-2">
          <PauseCircle className="w-4 h-4" /> Pausiert: {data.agency.pausiert_grund}
        </Card>
      )}

      <div className="space-y-4">
        {data.phases.map((p, i) => {
          const isCurrent = p.key === data.phase;
          const offen = p.schritte.filter((s) => s.status !== 'erledigt' && s.status !== 'nicht_noetig').length;
          return (
            <Card key={p.key} padding="none" className={`overflow-hidden ${isCurrent ? 'ring-2 ring-red-200' : ''}`}>
              <div className={`${p.farbe} px-4 py-2.5 text-white flex items-center justify-between`}>
                <div>
                  <span className="font-bold">{p.label}</span>
                  {isCurrent && <span className="ml-2 text-xs bg-white/25 rounded-full px-2 py-0.5">aktuell</span>}
                  {p.key === 'continuity' && data.agency?.launch_datum && (
                    <span className="ml-2 text-xs opacity-90">Kampagnenstart {new Date(data.agency.launch_datum).toLocaleDateString('de-DE')}</span>
                  )}
                </div>
                <span className="text-xs opacity-90">
                  {p.schritte.length ? `${p.schritte.length - offen}/${p.schritte.length} erledigt` : ''}
                </span>
              </div>
              <div className="px-4 divide-y divide-gray-100">
                {p.schritte.map((s) => (
                  <StepRow key={s.id} step={s} team={data.team} onChange={(patch) => patchStep(s.id, patch)} />
                ))}
                {!p.schritte.length && (
                  <div className="py-4 text-sm text-gray-500 flex items-center justify-between">
                    <span>{i < currentIndex ? 'Vor der Umstellung abgeschlossen.' : 'Startet, sobald die vorherige Phase fertig ist.'}</span>
                    {i > currentIndex && p.key !== 'offboarding' && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Phase "${p.label}" jetzt starten?`)) void patchAgency({ phase: p.key });
                        }}
                        className="text-xs font-semibold text-red-600 hover:underline"
                      >
                        Jetzt starten
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
