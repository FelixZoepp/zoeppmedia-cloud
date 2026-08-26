'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import {
  ListTodo,
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  CheckCircle2,
  Clock,
  Phone,
  AlertTriangle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OverdueTask {
  id: string;
  title: string;
  agency_id: string | null;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  due_date: string;
  status: string;
}

interface NewCandidate {
  id: string;
  name: string;
  phone: string | null;
  agency_id: string | null;
  created_at: string;
}

interface Callback {
  id: string;
  candidate_id: string;
  agency_id: string | null;
  notes: string | null;
  next_contact_date: string;
  created_at: string;
}

interface DueTodayTask {
  id: string;
  title: string;
  agency_id: string | null;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  due_date: string;
  status: string;
}

interface Stats {
  open_tasks: number;
  sla_met_today: number;
  sla_breached_today: number;
}

interface HeuteData {
  overdue: OverdueTask[];
  due_today: DueTodayTask[];
  new_candidates_15min: NewCandidate[];
  callbacks: Callback[];
  stats: Stats;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const PRIORITY_BADGE: Record<string, { tone: 'accent' | 'softAccent' | 'neutral' | 'outline'; label: string }> = {
  urgent: { tone: 'accent', label: 'Dringend' },
  high: { tone: 'softAccent', label: 'Hoch' },
  medium: { tone: 'neutral', label: 'Mittel' },
  low: { tone: 'outline', label: 'Niedrig' },
};

function relativeTimeGerman(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const absDiff = Math.abs(diff);
  const inPast = diff > 0;

  const minutes = Math.round(absDiff / 60000);
  const hours = Math.round(absDiff / 3600000);
  const days = Math.round(absDiff / 86400000);

  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return inPast ? `vor ${minutes} Min` : `in ${minutes} Min`;
  if (hours < 24) return inPast ? `vor ${hours} Std` : `in ${hours} Std`;
  return inPast ? `vor ${days} Tag${days > 1 ? 'en' : ''}` : `in ${days} Tag${days > 1 ? 'en' : ''}`;
}

function overdueSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days >= 1) return `seit ${days} Tag${days > 1 ? 'en' : ''}`;
  if (hours >= 1) return `seit ${hours} Std`;
  const minutes = Math.round(diff / 60000);
  return `seit ${minutes} Min`;
}

/* ------------------------------------------------------------------ */
/*  KPI Card                                                          */
/* ------------------------------------------------------------------ */

function KpiCard({ label, value, icon, iconBg = 'bg-gray-100', iconColor = 'text-gray-600', valueColor = 'text-gray-900' }: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  valueColor?: string;
}) {
  return (
    <Card padding="md" className="flex items-start gap-4">
      <div className={`flex-shrink-0 w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center ${iconColor}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">{label}</p>
        <p className={`text-2xl font-bold mt-1 tabular-nums leading-tight ${valueColor}`}>{value}</p>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function HeuteClient() {
  const [data, setData] = useState<HeuteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/today');
      if (!res.ok) throw new Error(`Fehler ${res.status}`);
      const json: HeuteData = await res.json();
      setData(json);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl">
        <PageHeader label="HEUTE" title="Tagesansicht" />
        <Card padding="md">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { overdue, due_today, new_candidates_15min, callbacks, stats } = data;

  return (
    <div className="max-w-6xl">
      <PageHeader
        label="HEUTE"
        title="Tagesansicht"
        description={new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      />

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label="Offene Aufgaben"
          value={stats.open_tasks}
          icon={<ListTodo className="w-5 h-5" />}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <KpiCard
          label="SLA eingehalten"
          value={stats.sla_met_today}
          icon={<ShieldCheck className="w-5 h-5" />}
          iconBg={stats.sla_met_today > 0 ? 'bg-green-50' : 'bg-gray-100'}
          iconColor={stats.sla_met_today > 0 ? 'text-green-600' : 'text-gray-600'}
          valueColor={stats.sla_met_today > 0 ? 'text-green-600' : 'text-gray-900'}
        />
        <KpiCard
          label="SLA verletzt"
          value={stats.sla_breached_today}
          icon={<ShieldAlert className="w-5 h-5" />}
          iconBg={stats.sla_breached_today > 0 ? 'bg-red-50' : 'bg-gray-100'}
          iconColor={stats.sla_breached_today > 0 ? 'text-red-600' : 'text-gray-600'}
          valueColor={stats.sla_breached_today > 0 ? 'text-red-600' : 'text-gray-900'}
        />
        <KpiCard
          label="Neue Bewerber (15 Min)"
          value={new_candidates_15min.length}
          icon={<UserPlus className="w-5 h-5" />}
          iconBg={new_candidates_15min.length > 0 ? 'bg-blue-50' : 'bg-gray-100'}
          iconColor={new_candidates_15min.length > 0 ? 'text-blue-600' : 'text-gray-600'}
        />
      </div>

      <div className="space-y-6">

        {/* ─── Overdue ─── */}
        <Card padding="none" className="border-l-4 border-l-red-500 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <h2 className="text-sm font-semibold text-gray-900">
                Überfällig
              </h2>
              {overdue.length > 0 && (
                <Badge tone="accent">{overdue.length}</Badge>
              )}
            </div>
          </div>
          {overdue.length === 0 ? (
            <div className="flex items-center gap-3 px-6 py-8 text-sm text-green-600">
              <CheckCircle2 className="w-5 h-5" />
              Keine überfälligen Aufgaben
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {overdue.map((task) => {
                const p = PRIORITY_BADGE[task.priority] ?? PRIORITY_BADGE.medium;
                return (
                  <div key={task.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                      {task.agency_id && (
                        <p className="text-xs text-gray-400 truncate">{task.agency_id.slice(0, 8)}</p>
                      )}
                    </div>
                    <Badge tone={p.tone}>{p.label}</Badge>
                    <span className="text-xs text-red-500 font-medium whitespace-nowrap">
                      {overdueSince(task.due_date)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ─── New Candidates < 15 Min ─── */}
        <Card padding="none" className="border-l-4 border-l-blue-500 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-gray-900">
                Neue Bewerber &lt; 15 Min
              </h2>
              {new_candidates_15min.length > 0 && (
                <Badge tone="neutral">{new_candidates_15min.length}</Badge>
              )}
            </div>
          </div>
          {new_candidates_15min.length === 0 ? (
            <div className="flex items-center gap-3 px-6 py-8 text-sm text-gray-400">
              Aktuell keine neuen Bewerber
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {new_candidates_15min.map((candidate) => (
                <div key={candidate.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{candidate.name}</p>
                    {candidate.agency_id && (
                      <p className="text-xs text-gray-400 truncate">{candidate.agency_id.slice(0, 8)}</p>
                    )}
                  </div>
                  <span className="text-xs text-blue-500 font-medium whitespace-nowrap">
                    {relativeTimeGerman(candidate.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ─── Callbacks ─── */}
        <Card padding="none" className="border-l-4 border-l-amber-500 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-gray-900">
                Rückrufe
              </h2>
              {callbacks.length > 0 && (
                <Badge tone="neutral">{callbacks.length}</Badge>
              )}
            </div>
          </div>
          {callbacks.length === 0 ? (
            <div className="flex items-center gap-3 px-6 py-8 text-sm text-gray-400">
              Keine Rückrufe geplant
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {callbacks.map((cb) => (
                <div key={cb.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      Kandidat {cb.candidate_id.slice(0, 8)}
                    </p>
                    {cb.notes && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{cb.notes}</p>
                    )}
                  </div>
                  <span className="text-xs text-amber-600 font-medium whitespace-nowrap">
                    {new Date(cb.next_contact_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ─── Due Today ─── */}
        <Card padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">
                Heute fällig
              </h2>
              {due_today.length > 0 && (
                <Badge tone="neutral">{due_today.length}</Badge>
              )}
            </div>
          </div>
          {due_today.length === 0 ? (
            <div className="flex items-center gap-3 px-6 py-8 text-sm text-gray-400">
              Keine Aufgaben für heute
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {due_today.map((task) => {
                const p = PRIORITY_BADGE[task.priority] ?? PRIORITY_BADGE.medium;
                return (
                  <div key={task.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                      {task.agency_id && (
                        <p className="text-xs text-gray-400 truncate">{task.agency_id.slice(0, 8)}</p>
                      )}
                    </div>
                    <Badge tone={p.tone}>{p.label}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
