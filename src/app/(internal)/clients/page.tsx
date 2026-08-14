'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Building2, AlertTriangle, Users, Clock, LogIn } from 'lucide-react';
import type { PipelineClient, ClientPhase } from '@/app/api/clients/pipeline/route';

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const COLUMNS: {
  key: ClientPhase;
  label: string;
  dot: string;
}[] = [
  { key: 'onboarding_termin', label: 'Onboarding Termin', dot: 'bg-gray-400' },
  { key: 'onboarding_formular', label: 'Onboarding Formular', dot: 'bg-amber-400' },
  { key: 'fulfillment', label: 'Fulfillment', dot: 'bg-violet-500' },
  { key: 'kampagne_live', label: 'Kampagne Live', dot: 'bg-green-500' },
  { key: 'kickoff_14d', label: 'Kickoff (14 Tage)', dot: 'bg-blue-500' },
  { key: 'bestandskunde', label: 'Bestandskunde', dot: 'bg-teal-500' },
];

/* ------------------------------------------------------------------ */
/*  Warning badge logic                                                */
/* ------------------------------------------------------------------ */

function getWarning(phase: ClientPhase, days: number): { text: string; urgent: boolean } | null {
  if (phase === 'onboarding_termin' && days > 3) {
    return { text: 'Wartet auf Onboarding-Termin', urgent: false };
  }
  if (phase === 'onboarding_formular' && days > 5) {
    return { text: 'Formular nicht ausgefüllt', urgent: true };
  }
  if (phase === 'fulfillment' && days > 7) {
    return { text: 'Fulfillment dauert zu lange', urgent: true };
  }
  if (phase === 'kampagne_live' && days > 14) {
    return { text: 'Kickoff steht an', urgent: false };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDays(days: number): string {
  if (days === 0) return 'Heute';
  if (days === 1) return 'Seit 1 Tag';
  return `Seit ${days} Tagen`;
}

function formatLastLogin(iso: string | null): string {
  if (!iso) return 'Nie eingeloggt';
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Heute';
  if (diffDays === 1) return 'Gestern';
  return `Vor ${diffDays} Tagen`;
}

/* ------------------------------------------------------------------ */
/*  Client Card                                                        */
/* ------------------------------------------------------------------ */

function ClientCard({ client }: { client: PipelineClient }) {
  const warning = getWarning(client.phase, client.days_in_phase);
  const pct =
    client.fulfillment_total > 0
      ? Math.round((client.fulfillment_done / client.fulfillment_total) * 100)
      : 0;

  return (
    <Link href={`/clients/${client.id}`}>
      <Card
        padding="sm"
        className="hover:shadow-md transition-shadow cursor-pointer group space-y-3"
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            {client.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-red-600 transition-colors leading-tight">
              {client.name}
            </p>
            <p className="text-xs text-gray-400 truncate">{client.contact_name}</p>
          </div>
        </div>

        {/* Warning badge */}
        {warning && (
          <div
            className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md ${
              warning.urgent
                ? 'bg-red-50 text-red-700'
                : 'bg-amber-50 text-amber-700'
            }`}
          >
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            {warning.text}
          </div>
        )}

        {/* Progress bar */}
        {client.fulfillment_total > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Fulfillment</span>
              <span className="text-xs font-medium text-gray-700">
                {client.fulfillment_done}/{client.fulfillment_total}
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDays(client.days_in_phase)}
          </span>
          <span className="flex items-center gap-1">
            <LogIn className="w-3 h-3" />
            {formatLastLogin(client.last_login)}
          </span>
        </div>

        {/* Candidate badge */}
        {client.candidate_count > 0 && (
          <div>
            <Badge tone="softAccent" className="flex items-center gap-1 w-fit">
              <Users className="w-3 h-3" />
              {client.candidate_count} Bewerber
            </Badge>
          </div>
        )}
      </Card>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Pipeline Kanban                                                    */
/* ------------------------------------------------------------------ */

function PipelineView({ clients }: { clients: PipelineClient[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
      {COLUMNS.map((col) => {
        const colClients = clients
          .filter((c) => c.phase === col.key)
          .sort((a, b) => b.days_in_phase - a.days_in_phase);

        const hasStuck = colClients.some(
          (c) => getWarning(c.phase, c.days_in_phase) !== null
        );

        return (
          <div key={col.key} className="flex-shrink-0 w-72">
            {/* Column header */}
            <div className="flex items-center gap-2 mb-4 px-1">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${col.dot}`} />
              <span className="text-xs font-semibold text-gray-900 uppercase tracking-wide">
                {col.label}
              </span>
              {hasStuck && (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              )}
              <span className="text-xs text-gray-400 font-medium ml-auto">
                {colClients.length}
              </span>
            </div>

            {/* Column body */}
            <div className="space-y-3 min-h-[120px] bg-gray-50 rounded-xl p-3 border border-gray-200 border-dashed">
              {colClients.map((c) => (
                <ClientCard key={c.id} client={c} />
              ))}
              {colClients.length === 0 && (
                <div className="flex items-center justify-center h-20 text-xs text-gray-400">
                  Keine Kunden
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'pipeline' | 'liste'>('pipeline');

  useEffect(() => {
    fetch('/api/clients/pipeline')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setClients(data);
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
        label="COCKPIT"
        title="Kunden"
        counter={`${clients.length} gesamt`}
        action={
          <SegmentedControl
            items={[
              { value: 'pipeline', label: 'Pipeline' },
              { value: 'liste', label: 'Liste' },
            ]}
            value={view}
            onChange={(v) => setView(v as 'pipeline' | 'liste')}
          />
        }
      />

      {clients.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Keine Kunden</h2>
          <p className="text-gray-600">
            Noch keine Agenturen angelegt. Erstelle eine Einladung unter &quot;Einladungen&quot;.
          </p>
        </Card>
      ) : view === 'pipeline' ? (
        <PipelineView clients={clients} />
      ) : (
        <ListView clients={clients} />
      )}
    </div>
  );
}
