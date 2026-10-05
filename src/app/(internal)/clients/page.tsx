'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Building2 } from 'lucide-react';
import type { PipelineClient, ClientPhase } from '@/app/api/clients/pipeline/route';
import { toast } from 'sonner';
import { FulfillmentBoard } from '@/components/fulfillment/board';
import { phaseLabel } from '@/lib/fulfillment/catalog';
import type { BoardClient } from '@/lib/fulfillment/views';

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const COLUMNS: {
  key: ClientPhase;
  label: string;
  dot: string;
}[] = [
  { key: 'onboarding_termin', label: 'Onboarding Termin', dot: 'bg-gray-400' },
  { key: 'fulfillment', label: 'Einrichtung', dot: 'bg-violet-500' },
  { key: 'warten_zugaenge', label: 'Warten auf Zugänge', dot: 'bg-orange-500' },
  { key: 'warten_starttermin', label: 'Warten auf Starttermin', dot: 'bg-sky-500' },
  { key: 'kampagne_starten', label: 'Kampagne starten', dot: 'bg-amber-500' },
  { key: 'kampagne_live', label: 'Kampagne Live', dot: 'bg-green-500' },
  { key: 'kickoff_14d', label: 'Kickoff (14 Tage)', dot: 'bg-blue-500' },
  { key: 'bestandskunde', label: 'Bestandskunde', dot: 'bg-teal-500' },
];

/* ------------------------------------------------------------------ */
/*  List View (original)                                               */
/* ------------------------------------------------------------------ */

function ListView({ clients }: { clients: PipelineClient[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {clients.map((c) => (
        <Link key={c.id} href={`/clients/${c.id}`}>
          <Card
            padding="md"
            className="hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-red-600 transition-colors">
                  {c.name}
                </p>
                <p className="text-xs text-gray-400 truncate">{c.contact_name}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Badge tone="neutral">
                {COLUMNS.find((col) => col.key === c.phase)?.label ?? c.phase}
              </Badge>
              <Badge tone={c.candidate_count > 0 ? 'softAccent' : 'neutral'}>
                {c.candidate_count} Bewerber
              </Badge>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function ClientsIndexPage() {
  const [clients, setClients] = useState<PipelineClient[]>([]);
  const [board, setBoard] = useState<BoardClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'pipeline' | 'liste'>('pipeline');

  useEffect(() => {
    Promise.all([
      fetch('/api/fulfillment/board').then((r) => r.json()),
      fetch('/api/clients/pipeline').then((r) => r.json()),
    ])
      .then(([b, c]) => {
        if (Array.isArray(b)) setBoard(b);
        if (Array.isArray(c)) setClients(c);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Kunden"
        description={view === 'pipeline' ? 'Pipeline wählen – jede Karte ist ein Kunde an seinem aktuellen Schritt.' : undefined}
        counter={`${board.length} gesamt`}
        action={
          <SegmentedControl
            items={[
              { value: 'pipeline', label: 'Ablauf' },
              { value: 'liste', label: 'Liste' },
            ]}
            value={view}
            onChange={(v) => setView(v as 'pipeline' | 'liste')}
          />
        }
      />

      {board.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Keine Kunden</h2>
          <p className="text-gray-600">
            Noch keine Agenturen angelegt. Erstelle eine Einladung unter &quot;Einladungen&quot;.
          </p>
        </Card>
      ) : view === 'pipeline' ? (
        <FulfillmentBoard
          clients={board}
          onStep={async (stepId, status) => {
            const res = await fetch(`/api/fulfillment/steps/${stepId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status }),
            });
            if (!res.ok) {
              toast.error('Konnte nicht gespeichert werden');
              return;
            }
            const { advancedTo } = (await res.json()) as { advancedTo: string | null };
            if (advancedTo) toast.success(`Phase abgeschlossen – weiter mit "${phaseLabel(advancedTo as never)}"`);
            const b = await fetch('/api/fulfillment/board').then((x) => x.json());
            if (Array.isArray(b)) setBoard(b);
          }}
        />
      ) : (
        <ListView clients={clients} />
      )}
    </div>
  );
}
