'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Clock, CheckCircle2, Circle, Loader2, ChevronRight,
  ShieldCheck, AlertTriangle,
} from 'lucide-react';

interface AgencyData {
  status: string;
  garantie_start: string | null;
  garantie_ende: string | null;
}

interface TaskData {
  id: string;
  titel: string;
  status: string;
  faellig_am: string | null;
}

const AGENCY_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  onboarding: { label: 'Onboarding', color: 'bg-amber-100 text-amber-800' },
  aktiv: { label: 'Aktiv', color: 'bg-green-100 text-green-800' },
  live: { label: 'Live', color: 'bg-green-100 text-green-800' },
  pausiert: { label: 'Pausiert', color: 'bg-gray-100 text-gray-600' },
  setup_fehler: { label: 'Setup-Fehler', color: 'bg-red-100 text-red-700' },
};

const TASK_STATUS_CONFIG: Record<string, { label: string; icon: typeof Circle; color: string }> = {
  offen: { label: 'Offen', icon: Circle, color: 'text-gray-400' },
  in_arbeit: { label: 'In Arbeit', icon: Loader2, color: 'text-red-500' },
  zur_freigabe: { label: 'Zur Freigabe', icon: ShieldCheck, color: 'text-amber-500' },
  blockiert: { label: 'Blockiert', icon: AlertTriangle, color: 'text-red-400' },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function formatFristRelative(dateStr: string | null): { text: string; isOverdue: boolean } {
  if (!dateStr) return { text: '', isOverdue: false };
  const days = daysUntil(dateStr);
  if (days < -1) return { text: `${Math.abs(days)} Tage überfällig`, isOverdue: true };
  if (days === -1) return { text: 'Seit gestern überfällig', isOverdue: true };
  if (days === 0) return { text: 'Heute fällig', isOverdue: false };
  if (days === 1) return { text: 'Morgen fällig', isOverdue: false };
  return { text: `In ${days} Tagen fällig`, isOverdue: false };
}

export function ProjectOverview({ agencyId }: { agencyId: string }) {
  const [agency, setAgency] = useState<AgencyData | null>(null);
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [agencyRes, tasksRes] = await Promise.all([
        fetch('/api/dashboard/project-status'),
        fetch('/api/project-tasks?owner_funktion=kunde'),
      ]);

      if (agencyRes.ok) {
        const agencyData = await agencyRes.json();
        setAgency(agencyData);
      }

      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        if (Array.isArray(tasksData)) {
          // Filter to open tasks only
          setTasks(
            tasksData.filter(
              (t: TaskData) =>
                t.status !== 'erledigt' && t.status !== 'nicht_noetig'
            )
          );
        }
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-40 mb-4" />
        <div className="h-8 bg-gray-100 rounded w-64 mb-4" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 bg-gray-50 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const statusConfig = agency?.status
    ? AGENCY_STATUS_LABELS[agency.status] || { label: agency.status, color: 'bg-gray-100 text-gray-600' }
    : null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      {/* Header */}
      <span className="text-xs font-semibold uppercase tracking-wider text-red-600 block mb-3">
        Projektübersicht
      </span>

      {/* Status + Garantie */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        {statusConfig && (
          <span
            className={`inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full ${statusConfig.color}`}
          >
            {statusConfig.label}
          </span>
        )}

        <div className="text-sm text-gray-600">
          {agency?.garantie_start ? (
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
              Garantie läuft seit {formatDate(agency.garantie_start)}
              {agency.garantie_ende && (
                <span className="text-gray-400">
                  &middot; noch {Math.max(0, daysUntil(agency.garantie_ende))} Tage
                </span>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-600">
              <Clock className="w-4 h-4 flex-shrink-0" />
              Warte auf Zugänge
            </span>
          )}
        </div>
      </div>

      {/* Customer Tasks */}
      {tasks.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Deine offenen Aufgaben
          </h3>
          <div className="space-y-1.5">
            {tasks.slice(0, 5).map((task) => {
              const cfg = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.offen;
              const StatusIcon = cfg.icon;
              const frist = formatFristRelative(task.faellig_am);

              return (
                <Link
                  key={task.id}
                  href={`/meine-aufgaben-portal/${task.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <StatusIcon
                    className={`w-4 h-4 flex-shrink-0 ${cfg.color} ${
                      task.status === 'in_arbeit' ? 'animate-spin' : ''
                    }`}
                  />
                  <span className="flex-1 text-sm font-medium text-gray-900 truncate group-hover:text-red-600 transition-colors">
                    {task.titel}
                  </span>
                  {frist.text && (
                    <span
                      className={`text-xs flex-shrink-0 font-medium flex items-center gap-1 ${
                        frist.isOverdue ? 'text-red-600' : 'text-gray-400'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      {frist.text}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </Link>
              );
            })}
          </div>
          {tasks.length > 5 && (
            <Link
              href="/aufgaben"
              className="text-xs font-semibold text-red-600 hover:text-red-700 mt-3 flex items-center gap-0.5"
            >
              Alle {tasks.length} Aufgaben anzeigen
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      )}

      {tasks.length === 0 && (
        <p className="text-sm text-gray-400">Keine offenen Aufgaben</p>
      )}
    </div>
  );
}
