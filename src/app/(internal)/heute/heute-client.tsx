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
  Flame,
  Check,
  CalendarClock,
  Map,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UnifiedTask {
  id: string;
  task_source: string;
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

interface CallToday {
  id: string;
  agency_id: string | null;
  candidate_id: string | null;
  event_name: string | null;
  invitee_name: string | null;
  start_time: string;
}

interface Problem {
  id: string;
  agency_id: string;
  problem_key: string;
  severity: 'warning' | 'critical';
  current_value: number | null;
  target_value: number | null;
  detected_at: string;
}

interface Stats {
  open_tasks: number;
  sla_met_today: number;
  sla_breached_today: number;
  active_problems: number;
}

interface HeuteData {
  overdue: UnifiedTask[];
  due_today: UnifiedTask[];
  new_candidates_15min: NewCandidate[];
  callbacks: Callback[];
  calls_today: CallToday[];
  problems: Problem[];
  agency_names: Record<string, string>;
  candidate_names: Record<string, { name: string; phone: string | null }>;
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

const PROBLEM_LABELS: Record<string, string> = {
  low_reach_rate: 'Erreichbarkeit unter 50 %',
  low_termin_rate: 'Terminquote unter 15 %',
  high_cpl: 'CPL über 40 €',
  low_candidates: 'Weniger als 5 Bewerber/Woche',
  no_calls_24h: 'Keine Anrufe seit 24 Std',
  pipeline_stall: 'Bewerber hängen in Phase fest',
  low_satisfaction: 'Zufriedenheit unter 3 Sternen',
  indeed_no_candidates: 'Indeed liefert keine Bewerber',
  low_meta_leads: 'Meta liefert zu wenige Leads',
  assets_leer: 'Asset-Halde ist leer',
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
/*  1-Klick Action Button                                              */
/* ------------------------------------------------------------------ */

function DoneButton({ onClick, busy, label = 'Erledigt' }: { onClick: () => void; busy: boolean; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition-colors disabled:opacity-50"
    >
      <Check className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function HeuteClient() {
  const [data, setData] = useState<HeuteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

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

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const completeTask = useCallback(async (taskId: string, taskSource: string) => {
    setBusy(taskId, true);
    try {
      const res = await fetch('/api/tasks/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, task_source: taskSource }),
      });
      if (!res.ok) throw new Error('Aktion fehlgeschlagen');
      // Optimistisch aus der Liste entfernen
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          overdue: prev.overdue.filter((t) => t.id !== taskId),
          due_today: prev.due_today.filter((t) => t.id !== taskId),
          callbacks: prev.callbacks.filter((c) => c.id !== taskId),
          stats: { ...prev.stats, open_tasks: Math.max(0, prev.stats.open_tasks - 1) },
        };
      });
    } catch {
      fetchData();
    } finally {
      setBusy(taskId, false);
    }
  }, [fetchData]);

  const resolveProblem = useCallback(async (problemId: string) => {
    setBusy(problemId, true);
    try {
      const res = await fetch(`/api/problems/${problemId}`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Aktion fehlgeschlagen');
      setData((prev) => {
        if (!prev) return prev;
        const problems = prev.problems.filter((p) => p.id !== problemId);
        return { ...prev, problems, stats: { ...prev.stats, active_problems: problems.length } };
      });
    } catch {
      fetchData();
    } finally {
      setBusy(problemId, false);
    }
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

  const { overdue, due_today, new_candidates_15min, callbacks, calls_today, problems, agency_names, candidate_names, stats } = data;

  const agencyLabel = (agencyId: string | null) =>
    agencyId ? agency_names[agencyId] ?? agencyId.slice(0, 8) : null;

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
          label="Aktive Probleme"
          value={stats.active_problems}
          icon={<Flame className="w-5 h-5" />}
          iconBg={stats.active_problems > 0 ? 'bg-red-50' : 'bg-gray-100'}
          iconColor={stats.active_problems > 0 ? 'text-red-600' : 'text-gray-600'}
          valueColor={stats.active_problems > 0 ? 'text-red-600' : 'text-gray-900'}
        />
        <KpiCard
          label="Offene Aufgaben"
          value={stats.open_tasks}
          icon={<ListTodo className="w-5 h-5" />}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
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

        {/* ─── Aktive Probleme (Alert-Inbox) ─── */}
        <Card padding="none" className="border-l-4 border-l-red-600 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-red-600" />
              <h2 className="text-sm font-semibold text-gray-900">Aktive Probleme</h2>
              {problems.length > 0 && <Badge tone="accent">{problems.length}</Badge>}
            </div>
          </div>
          {problems.length === 0 ? (
            <div className="flex items-center gap-3 px-6 py-8 text-sm text-green-600">
              <ShieldCheck className="w-5 h-5" />
              Keine aktiven Probleme — alle Kunden im grünen Bereich
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {problems.map((p) => (
                <div key={p.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {PROBLEM_LABELS[p.problem_key] ?? p.problem_key}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {agencyLabel(p.agency_id)}
                      {p.current_value != null && p.target_value != null && (
                        <> · Ist: {p.current_value} / Ziel: {p.target_value}</>
                      )}
                      {' · '}{relativeTimeGerman(p.detected_at)}
                    </p>
                  </div>
                  <Badge tone={p.severity === 'critical' ? 'accent' : 'softAccent'}>
                    {p.severity === 'critical' ? 'Kritisch' : 'Warnung'}
                  </Badge>
                  <DoneButton label="Gelöst" busy={busyIds.has(p.id)} onClick={() => resolveProblem(p.id)} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ─── Heutige Termine (mit Fahrplan-Link) ─── */}
        {calls_today.length > 0 && (
          <Card padding="none" className="border-l-4 border-l-violet-500 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-violet-500" />
                <h2 className="text-sm font-semibold text-gray-900">Heutige Termine</h2>
                <Badge tone="neutral">{calls_today.length}</Badge>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {calls_today.map((call) => {
                const isKundenCall = !call.candidate_id && call.agency_id;
                return (
                  <div key={call.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
                    <span className="text-sm font-semibold text-violet-600 tabular-nums whitespace-nowrap">
                      {new Date(call.start_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {call.event_name ?? 'Termin'}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {[call.invitee_name, agencyLabel(call.agency_id)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {isKundenCall ? (
                      <a
                        href={`/clients/${call.agency_id}/fahrplan`}
                        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                      >
                        <Map className="w-3.5 h-3.5" />
                        Fahrplan öffnen
                      </a>
                    ) : call.candidate_id ? (
                      <a
                        href={`/candidates/${call.candidate_id}`}
                        className="flex-shrink-0 text-xs font-semibold text-gray-500 hover:text-gray-700"
                      >
                        Bewerber öffnen
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* ─── Overdue ─── */}
        <Card padding="none" className="border-l-4 border-l-red-500 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <h2 className="text-sm font-semibold text-gray-900">Überfällig</h2>
              {overdue.length > 0 && <Badge tone="accent">{overdue.length}</Badge>}
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
                        <p className="text-xs text-gray-400 truncate">{agencyLabel(task.agency_id)}</p>
                      )}
                    </div>
                    <Badge tone={p.tone}>{p.label}</Badge>
                    <span className="text-xs text-red-500 font-medium whitespace-nowrap">
                      {overdueSince(task.due_date)}
                    </span>
                    <DoneButton busy={busyIds.has(task.id)} onClick={() => completeTask(task.id, task.task_source)} />
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
                <a
                  key={candidate.id}
                  href={`/candidates/${candidate.id}`}
                  className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{candidate.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {[agencyLabel(candidate.agency_id), candidate.phone].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className="text-xs text-blue-500 font-medium whitespace-nowrap">
                    {relativeTimeGerman(candidate.created_at)}
                  </span>
                </a>
              ))}
            </div>
          )}
        </Card>

        {/* ─── Callbacks ─── */}
        <Card padding="none" className="border-l-4 border-l-amber-500 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-gray-900">Rückrufe</h2>
              {callbacks.length > 0 && <Badge tone="neutral">{callbacks.length}</Badge>}
            </div>
          </div>
          {callbacks.length === 0 ? (
            <div className="flex items-center gap-3 px-6 py-8 text-sm text-gray-400">
              Keine Rückrufe geplant
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {callbacks.map((cb) => {
                const cand = candidate_names[cb.candidate_id];
                return (
                  <div key={cb.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <a href={`/candidates/${cb.candidate_id}`} className="text-sm font-medium text-gray-900 truncate hover:underline">
                        {cand?.name ?? `Kandidat ${cb.candidate_id.slice(0, 8)}`}
                      </a>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {[cand?.phone, cb.notes].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="text-xs text-amber-600 font-medium whitespace-nowrap">
                      {new Date(cb.next_contact_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                    </span>
                    <DoneButton busy={busyIds.has(cb.id)} onClick={() => completeTask(cb.id, 'callback')} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ─── Due Today ─── */}
        <Card padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">Heute fällig</h2>
              {due_today.length > 0 && <Badge tone="neutral">{due_today.length}</Badge>}
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
                        <p className="text-xs text-gray-400 truncate">{agencyLabel(task.agency_id)}</p>
                      )}
                    </div>
                    <Badge tone={p.tone}>{p.label}</Badge>
                    <DoneButton busy={busyIds.has(task.id)} onClick={() => completeTask(task.id, task.task_source)} />
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
