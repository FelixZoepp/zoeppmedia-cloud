'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StepRow } from '@/components/fulfillment/step-row';
import type { StepView } from '@/lib/fulfillment/views';
import { today } from '@/lib/fulfillment/views-client';

type Gruppe = { key: string; label: string; filter: (s: StepView) => boolean };

const GRUPPEN: Gruppe[] = [
  { key: 'pruefen', label: 'Vom Kunden erledigt – bitte prüfen', filter: (s) => s.status === 'zur_pruefung' },
  { key: 'ueberfaellig', label: 'Überfällig', filter: (s) => s.status !== 'zur_pruefung' && s.ueberfaellig },
  { key: 'heute', label: 'Heute fällig', filter: (s) => s.status !== 'zur_pruefung' && !s.ueberfaellig && s.faellig_am === today() },
  { key: 'demnaechst', label: 'Demnächst', filter: (s) => s.status !== 'zur_pruefung' && !s.ueberfaellig && s.faellig_am !== today() },
];

export default function MeineTodosPage() {
  const [steps, setSteps] = useState<StepView[] | null>(null);

  const load = () =>
    fetch('/api/meine-todos')
      .then((r) => (r.ok ? r.json() : { schritte: [] }))
      .then((d) => setSteps(d.schritte ?? []));

  useEffect(() => {
    let cancelled = false;
    fetch('/api/meine-todos')
      .then((r) => (r.ok ? r.json() : { schritte: [] }))
      .then((d) => {
        if (!cancelled) setSteps(d.schritte ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/fulfillment/steps/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) toast.error('Konnte nicht gespeichert werden');
    await load();
  };

  if (!steps) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader label="MEINE ARBEIT" title="Meine Aufgaben" counter={`${steps.length} offen`} />
      {!steps.length && (
        <Card padding="lg" className="text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">Alles erledigt. Nichts liegt gerade bei dir.</p>
        </Card>
      )}
      <div className="space-y-4">
        {GRUPPEN.map((g) => {
          const list = steps.filter(g.filter);
          if (!list.length) return null;
          return (
            <Card key={g.key} padding="none" className="overflow-hidden">
              <div className={`px-4 py-2.5 text-sm font-bold ${g.key === 'ueberfaellig' ? 'bg-red-50 text-red-700' : g.key === 'pruefen' ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-800'}`}>
                {g.label} <span className="font-normal opacity-70">({list.length})</span>
              </div>
              <div className="px-4 divide-y divide-gray-100">
                {list.map((s) => (
                  <div key={s.id}>
                    <StepRow step={s} showAgency onChange={(p) => patch(s.id, p)} />
                    <Link href={`/clients/${s.agency_id}/ablauf`} className="block -mt-1 pb-2 text-[11px] text-gray-400 hover:text-red-600">
                      Ablauf von {s.agency_name} öffnen →
                    </Link>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
