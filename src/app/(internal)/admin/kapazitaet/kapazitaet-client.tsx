'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import {
  Gauge,
  AlertTriangle,
  ClipboardList,
  CheckSquare,
  Map,
  Building2,
} from 'lucide-react';

interface AgencyCapacity {
  agency_id: string;
  agency_name: string;
  betreuungsstufe: 'A' | 'B';
  open_tasks: number;
  overdue_tasks: number;
  active_problems: number;
  critical_problems: number;
  open_approvals: number;
  last_activity: string | null;
  load_score: number;
  load_level: 'gruen' | 'gelb' | 'rot';
}

interface CapacityStats {
  total_agencies: number;
  total_open_tasks: number;
  total_overdue: number;
  total_problems: number;
  rot: number;
  gelb: number;
  gruen: number;
  stufe_a: number;
}

const LEVEL_STYLES: Record<AgencyCapacity['load_level'], string> = {
  rot: 'bg-red-500',
  gelb: 'bg-amber-400',
  gruen: 'bg-green-500',
};

const LEVEL_LABELS: Record<AgencyCapacity['load_level'], string> = {
  rot: 'Überlastet',
  gelb: 'Erhöht',
  gruen: 'Im Griff',
};

function daysSince(iso: string | null): string {
  if (!iso) return 'Keine Aktivität';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'Heute aktiv';
  if (days === 1) return 'Gestern aktiv';
  return `Vor ${days} Tagen aktiv`;
}

function AgencyCapacityRow({ agency }: { agency: AgencyCapacity }) {
  const stale =
    agency.last_activity &&
    Date.now() - new Date(agency.last_activity).getTime() > 5 * 86400000;

  return (
    <Card padding="sm">
      <div className="flex items-center gap-3">
        <div
          className={`w-3 h-3 rounded-full flex-shrink-0 ${LEVEL_STYLES[agency.load_level]}`}
          title={LEVEL_LABELS[agency.load_level]}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {agency.agency_name}
            </p>
            <Badge tone={agency.betreuungsstufe === 'A' ? 'accent' : 'neutral'}>
              Stufe {agency.betreuungsstufe}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
            <span className={agency.overdue_tasks > 0 ? 'text-red-600 font-medium' : ''}>
              {agency.open_tasks} offen{agency.overdue_tasks > 0 ? ` (${agency.overdue_tasks} überfällig)` : ''}
            </span>
            <span className={agency.critical_problems > 0 ? 'text-red-600 font-medium' : agency.active_problems > 0 ? 'text-amber-600' : ''}>
              {agency.active_problems} Alerts{agency.critical_problems > 0 ? ` (${agency.critical_problems} kritisch)` : ''}
            </span>
            {agency.open_approvals > 0 && <span>{agency.open_approvals} Freigaben</span>}
            <span className={stale ? 'text-amber-600' : ''}>
              {daysSince(agency.last_activity)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-mono text-gray-400" title="Lastindex">
            {agency.load_score}
          </span>
          <Link
            href={`/clients/${agency.agency_id}/fahrplan`}
            className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700"
          >
            <Map className="w-3.5 h-3.5" />
            Fahrplan
          </Link>
          <Link
            href={`/clients/${agency.agency_id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
          >
            <Building2 className="w-3.5 h-3.5" />
            Kunde
          </Link>
        </div>
      </div>
    </Card>
  );
}

export function KapazitaetClient() {
  const [agencies, setAgencies] = useState<AgencyCapacity[]>([]);
  const [stats, setStats] = useState<CapacityStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/kapazitaet')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setAgencies(data.agencies ?? []);
        setStats(data.stats ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="max-w-4xl">
      <PageHeader
        label="VERWALTUNG"
        title="Kapazität"
        description="Arbeitslast pro Kunde — wer braucht heute Aufmerksamkeit, wer läuft von allein"
        counter={
          stats
            ? stats.rot > 0
              ? `${stats.rot} überlastet`
              : `${stats.total_agencies} Kunden`
            : undefined
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
        </div>
      ) : agencies.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Gauge className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Keine Kunden</h2>
          <p className="text-gray-600">Es gibt noch keine Agenturen.</p>
        </Card>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <Card padding="sm">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-500">Auslastung</span>
                </div>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  <span className="text-red-600">{stats.rot}</span>
                  {' / '}
                  <span className="text-amber-500">{stats.gelb}</span>
                  {' / '}
                  <span className="text-green-600">{stats.gruen}</span>
                </p>
              </Card>
              <Card padding="sm">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-500">Offene Aufgaben</span>
                </div>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  {stats.total_open_tasks}
                  {stats.total_overdue > 0 && (
                    <span className="text-sm font-medium text-red-600 ml-1">
                      ({stats.total_overdue} überfällig)
                    </span>
                  )}
                </p>
              </Card>
              <Card padding="sm">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-500">Aktive Alerts</span>
                </div>
                <p className="text-lg font-bold text-gray-900 mt-1">{stats.total_problems}</p>
              </Card>
              <Card padding="sm">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-500">Stufe A (erste 90 Tage)</span>
                </div>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  {stats.stufe_a}
                  <span className="text-sm font-medium text-gray-400 ml-1">
                    / {stats.total_agencies}
                  </span>
                </p>
              </Card>
            </div>
          )}

          <div className="space-y-2">
            {agencies.map((agency) => (
              <AgencyCapacityRow key={agency.agency_id} agency={agency} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
