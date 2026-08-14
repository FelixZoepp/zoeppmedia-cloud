'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import {
  ArrowLeft, Users, UserCheck, TrendingUp, Calendar, AlertTriangle,
  BookOpen, CheckCircle, ChevronRight, Target, Activity, ExternalLink,
  ListChecks, Clock, AlertCircle,
} from 'lucide-react';
import type { Agency, AgencyProblem, PlaybookEntry, ActivityLogEntry, PerspectiveFunnel, OnboardingProgress } from '@/lib/types/database';
import { ActivityFeed } from '@/components/activity-feed';

/* ── Types ───────────────────────────────────────────────── */

interface KpiItem {
  key: string;
  label: string;
  value: number;
  unit: string;
  direction: 'lower_is_better' | 'higher_is_better';
  isOverride: boolean;
  defaultValue: number;
}

type LoginHistoryStats = {
  entries: { id: string; created_at: string; ip_address: string | null }[];
  last7: number;
  last30: number;
  lastLogin: string | null;
};

type AgencyDetail = {
  agency: Agency;
  totalCandidates: number;
  hired: number;
  hireRate: number;
  funnel: { stage: string; color: string; count: number }[];
  sourceBreakdown: { meta: number; indeed: number; manual: number };
  lastLogin: string | null;
  recentCandidates: number;
  upsellSignals: string[];
  kpis: KpiItem[];
  problems: AgencyProblem[];
  playbooks: PlaybookEntry[];
};

/* ── Onboarding Progress ─────────────────────────────────── */

const TOTAL_STEPS = 5;
const SLOW_THRESHOLD_SECONDS = 300; // 5 min — flag as unusually long

function OnboardingProgressSection({ agencyId }: { agencyId: string }) {
  const [progress, setProgress] = useState<OnboardingProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/onboarding/progress?agency_id=${agencyId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setProgress(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agencyId]);

  const stepMap = new Map(progress.map((p) => [p.step_number, p]));

  function formatDuration(seconds: number | null): string {
    if (seconds === null) return '—';
    if (seconds < 60) return `${seconds}s`;
    return `${Math.round(seconds / 60)}m`;
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  const completedCount = progress.filter((p) => p.completed_at !== null).length;
  const allDone = completedCount === TOTAL_STEPS;

  return (
    <Card padding="lg" className="mb-6">
      <div className="flex items-center gap-2 mb-5">
        <ListChecks size={16} className="text-red-600" />
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
          Onboarding Fortschritt
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">{completedCount}/{TOTAL_STEPS} Schritte</span>
          {allDone && (
            <Badge tone="success">Abgeschlossen</Badge>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-6 h-6 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
        </div>
      ) : progress.length === 0 ? (
        <p className="text-sm text-gray-400">Noch kein Onboarding gestartet.</p>
      ) : (
        <div className="space-y-3">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((stepNum) => {
            const entry = stepMap.get(stepNum);
            const isDone = entry?.completed_at != null;
            const isStarted = entry != null;
            const isSlow =
              entry?.time_spent_seconds != null &&
              entry.time_spent_seconds > SLOW_THRESHOLD_SECONDS;
            const isNeverCompleted = isStarted && !isDone;

            return (
              <div
                key={stepNum}
                className={`flex items-start gap-4 p-4 rounded-xl border ${
                  isDone
                    ? 'bg-green-50 border-green-200'
                    : isStarted
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                {/* Status icon */}
                <div className={`mt-0.5 shrink-0 ${
                  isDone ? 'text-green-600' : isStarted ? 'text-amber-500' : 'text-gray-300'
                }`}>
                  {isDone ? (
                    <CheckCircle size={16} />
                  ) : isStarted ? (
                    <Clock size={16} />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-400">Schritt {stepNum}</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {entry?.step_name ?? `Schritt ${stepNum}`}
                    </span>
                    {isSlow && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 font-medium">
                        <AlertCircle size={11} />
                        Lange gedauert
                      </span>
                    )}
                    {isNeverCompleted && (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                        <AlertCircle size={11} />
                        Nicht abgeschlossen
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    {entry?.started_at && (
                      <span className="text-xs text-gray-500">
                        Gestartet: {formatDate(entry.started_at)}
                      </span>
                    )}
                    {entry?.completed_at && (
                      <span className="text-xs text-gray-500">
                        Abgeschlossen: {formatDate(entry.completed_at)}
                      </span>
                    )}
                    {entry?.time_spent_seconds != null && (
                      <span className={`text-xs font-medium ${isSlow ? 'text-amber-600' : 'text-gray-500'}`}>
                        Dauer: {formatDuration(entry.time_spent_seconds)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Badge */}
                <div className="shrink-0">
                  {isDone ? (
                    <Badge tone="success">Fertig</Badge>
                  ) : isStarted ? (
                    <Badge tone="neutral" className="!bg-amber-100 !text-amber-700">Gestartet</Badge>
                  ) : (
                    <Badge tone="neutral">Ausstehend</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ── KPI Progress Bar ────────────────────────────────────── */

function KpiBar({ kpi, onOverride }: { kpi: KpiItem; onOverride: (key: string, current: number) => void }) {
  const ratio = kpi.defaultValue > 0 ? kpi.value / kpi.defaultValue : 0;
  const isGood =
    kpi.direction === 'higher_is_better' ? ratio >= 1 : ratio <= 1;
  const barWidth = Math.min(ratio * 100, 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-900">{kpi.label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            Ist: <span className="font-semibold text-gray-900">{kpi.value}{kpi.unit}</span>
          </span>
          <span className="text-xs text-gray-400">
            Soll: <span className="font-semibold">{kpi.defaultValue}{kpi.unit}</span>
          </span>
          {kpi.isOverride && (
            <Badge tone="softAccent" className="text-xs py-0.5 px-2">Individuell</Badge>
          )}
          <button
            onClick={() => onOverride(kpi.key, kpi.value)}
            className="text-xs font-semibold text-red-600 hover:text-red-700 uppercase tracking-wide transition-colors"
          >
            Ziel anpassen
          </button>
        </div>
      </div>
      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isGood ? 'bg-green-500' : 'bg-red-600'}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

/* ── Problem Alert ───────────────────────────────────────── */

function ProblemAlert({
  problem,
  playbook,
  onResolve,
  onPlaybook,
}: {
  problem: AgencyProblem;
  playbook: PlaybookEntry | undefined;
  onResolve: (id: string) => void;
  onPlaybook: (p: PlaybookEntry) => void;
}) {
  const isCritical = problem.severity === 'critical';
  return (
    <div
      className={`flex items-start gap-4 p-4 rounded-xl border ${
        isCritical
          ? 'bg-red-50 border-red-200'
          : 'bg-amber-50 border-amber-200'
      }`}
    >
      <AlertTriangle
        size={16}
        className={`mt-0.5 shrink-0 ${isCritical ? 'text-red-600' : 'text-amber-500'}`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-semibold ${isCritical ? 'text-red-700' : 'text-amber-700'}`}>
            {problem.problem_key.replace(/_/g, ' ')}
          </span>
          <Badge tone={isCritical ? 'accent' : 'neutral'} className="text-xs py-0.5 px-2">
            {isCritical ? 'Kritisch' : 'Warnung'}
          </Badge>
        </div>
        {(problem.current_value !== null || problem.target_value !== null) && (
          <p className="text-xs text-gray-600 mb-2">
            {problem.current_value !== null && `Aktuell: ${problem.current_value}`}
            {problem.current_value !== null && problem.target_value !== null && ' · '}
            {problem.target_value !== null && `Ziel: ${problem.target_value}`}
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {playbook && (
            <button
              onClick={() => onPlaybook(playbook)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-600 transition-colors"
            >
              <BookOpen size={12} />
              Playbook anzeigen
            </button>
          )}
          <button
            onClick={() => onResolve(problem.id)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:text-green-800 transition-colors"
          >
            <CheckCircle size={12} />
            Als gelöst markieren
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Playbook Modal Content ──────────────────────────────── */

function PlaybookContent({ entry }: { entry: PlaybookEntry }) {
  return (
    <div className="space-y-8 overflow-y-auto max-h-[60vh] pr-1">
      <p className="text-sm text-gray-600">{entry.description}</p>

      {entry.causes.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Mögliche Ursachen</h3>
          <ul className="space-y-1.5">
            {entry.causes.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-900">
                <ChevronRight size={14} className="text-red-600 mt-0.5 shrink-0" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.immediate_actions.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-2">Sofortmaßnahmen</h3>
          <ul className="space-y-1.5">
            {entry.immediate_actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-900">
                <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.long_term_actions.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-green-700 uppercase tracking-wide mb-2">Langfristige Maßnahmen</h3>
          <ul className="space-y-1.5">
            {entry.long_term_actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-900">
                <span className="w-4 h-4 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.escalation_trigger && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <h3 className="text-xs font-bold text-red-600 uppercase tracking-wide mb-1">Eskalation wenn</h3>
          <p className="text-xs text-red-700">{entry.escalation_trigger}</p>
        </div>
      )}
    </div>
  );
}

/* ── Override Modal Content ──────────────────────────────── */

function OverrideForm({
  kpiKey,
  currentValue,
  agencyId,
  onDone,
}: {
  kpiKey: string;
  currentValue: number;
  agencyId: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState(String(currentValue));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/kpi/agency/${agencyId}/${encodeURIComponent(kpiKey)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: Number(value) }),
    });
    setSaving(false);
    onDone();
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Neues Ziel für <strong>{kpiKey.replace(/_/g, ' ')}</strong> festlegen.
      </p>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white shadow-sm outline-none"
      />
      <Button onClick={save} disabled={saving} className="w-full" glow>
        {saving ? 'Speichern…' : 'Ziel speichern'}
      </Button>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────── */

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AgencyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePlaybook, setActivePlaybook] = useState<PlaybookEntry | null>(null);
  const [overrideKpi, setOverrideKpi] = useState<{ key: string; value: number } | null>(null);
  const [activityEntries, setActivityEntries] = useState<ActivityLogEntry[]>([]);
  const [loginStats, setLoginStats] = useState<LoginHistoryStats | null>(null);
  const [funnels, setFunnels] = useState<PerspectiveFunnel[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/agencies/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Activity feed (last 20 entries)
    fetch(`/api/activity?agency_id=${id}&limit=20`)
      .then((r) => r.json())
      .then((entries) => { if (Array.isArray(entries)) setActivityEntries(entries); })
      .catch(() => {});

    // Login history stats
    fetch(`/api/activity/login-history?agency_id=${id}&limit=100`)
      .then((r) => r.json())
      .then((stats) => { if (stats?.lastLogin !== undefined) setLoginStats(stats); })
      .catch(() => {});

    // Perspective funnels (fetch all, filter client-side)
    fetch(`/api/perspective/funnels`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          setFunnels(d.filter((f: PerspectiveFunnel) => f.agency_id === id));
        }
      })
      .catch(() => {});
  }, [id]);

  async function resolveProblem(problemId: string) {
    await fetch(`/api/problems/${problemId}`, { method: 'PATCH' });
    setData((prev) =>
      prev
        ? { ...prev, problems: prev.problems.filter((p) => p.id !== problemId) }
        : prev
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card padding="lg" className="text-center">
        <p className="text-gray-600">Agentur nicht gefunden.</p>
      </Card>
    );
  }

  const { agency, totalCandidates, hired, hireRate, funnel, sourceBreakdown, lastLogin, recentCandidates, upsellSignals, kpis, problems, playbooks } = data;

  const playbookMap = new Map(playbooks.map((p) => [p.problem_key, p]));

  const summaryKpis = [
    { label: 'Bewerber gesamt', value: totalCandidates, icon: <Users size={20} />, accent: false },
    { label: 'Eingestellt', value: hired, icon: <UserCheck size={20} />, accent: true },
    { label: 'Einstellungsquote', value: `${hireRate}%`, icon: <TrendingUp size={20} />, accent: false },
    { label: 'Letzte 30 Tage', value: recentCandidates, icon: <Calendar size={20} />, accent: false },
  ];

  const funnelColors = [
    '#ef4444', '#f87171', '#fca5a5',
    '#fecaca', '#fee2e2', '#d1d5db',
  ];

  const criticalCount = problems.filter((p) => p.severity === 'critical').length;
  const warningCount = problems.filter((p) => p.severity === 'warning').length;

  return (
    <div>
      {/* Back link + header */}
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-500 transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Zurück zur Übersicht
      </Link>

      <PageHeader
        label="KUNDEN"
        title={agency.name}
        description={`${agency.contact_name} \u00B7 ${agency.email}`}
      />

      {/* ── Problem Alerts ─────────────────────────────── */}
      {problems.length > 0 && (
        <Card padding="lg" className="mb-8 !border-red-200">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-red-600 shrink-0" />
            <h2 className="text-sm font-bold text-red-700 uppercase tracking-wide">
              Aktive Probleme
            </h2>
            <div className="flex items-center gap-2 ml-auto">
              {criticalCount > 0 && (
                <Badge tone="accent">{criticalCount} Kritisch</Badge>
              )}
              {warningCount > 0 && (
                <Badge tone="neutral" className="!bg-amber-100 !text-amber-700">{warningCount} Warnung</Badge>
              )}
            </div>
          </div>
          <div className="space-y-6">
            {problems.map((p) => (
              <ProblemAlert
                key={p.id}
                problem={p}
                playbook={playbookMap.get(p.problem_key)}
                onResolve={resolveProblem}
                onPlaybook={setActivePlaybook}
              />
            ))}
          </div>
        </Card>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {summaryKpis.map((kpi) => (
          <Card key={kpi.label} padding="md">
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                kpi.accent ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'
              }`}>
                {kpi.icon}
              </div>
              <span className="text-sm text-gray-600 font-medium">
                {kpi.label}
              </span>
            </div>
            <p className={`text-3xl font-extrabold tracking-tight ${
              kpi.accent ? 'text-green-700' : 'text-gray-900'
            }`}>
              {kpi.value}
            </p>
          </Card>
        ))}
      </div>

      {/* ── KPI Soll/Ist Bars ──────────────────────────── */}
      {kpis.length > 0 && (
        <Card padding="lg" className="mb-6">
          <div className="flex items-center gap-2 mb-6">
            <Target size={16} className="text-red-600" />
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
              KPI Soll / Ist
            </h2>
          </div>
          <div className="space-y-4">
            {kpis.map((kpi) => (
              <KpiBar
                key={kpi.key}
                kpi={kpi}
                onOverride={(key, value) => setOverrideKpi({ key, value })}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Funnel */}
      <Card padding="lg" className="mb-6">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-6">
          Conversion Funnel
        </h2>
        <div className="space-y-6">
          {funnel?.map((f, index) => {
            const maxCount = Math.max(...(funnel?.map((x) => x.count) || [1]), 1);
            const width = Math.max((f.count / maxCount) * 100, 4);
            const barColor = funnelColors[index] || funnelColors[funnelColors.length - 1];
            return (
              <div key={f.stage} className="flex items-center gap-4">
                <span className="text-sm text-gray-600 w-44 flex-shrink-0 font-medium">
                  {f.stage}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center px-3 transition-all duration-500"
                    style={{ width: `${width}%`, backgroundColor: barColor }}
                  >
                    <span className="text-sm font-semibold text-white drop-shadow-sm">
                      {f.count}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Source Breakdown */}
      <Card padding="lg" className="mb-6">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-6">
          Quellen
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl font-extrabold text-red-600">{sourceBreakdown.meta}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Meta</p>
          </div>
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl font-extrabold text-red-600">{sourceBreakdown.indeed}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Indeed</p>
          </div>
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl font-extrabold text-gray-900">{sourceBreakdown.manual}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Manuell</p>
          </div>
        </div>
      </Card>

      {/* ── Aktivität ──────────────────────────────────── */}
      <Card padding="lg" className="mb-6">
        <div className="flex items-center gap-2 mb-6">
          <Activity size={16} className="text-red-600" />
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Aktivität
          </h2>
        </div>

        {/* Login stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-400 mb-1">Letzter Login</p>
            {loginStats?.lastLogin ? (
              <>
                <p className="text-sm font-semibold text-gray-900">
                  {new Date(loginStats.lastLogin).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </p>
                {/* Inactivity warning */}
                {(() => {
                  const daysSince = Math.floor(
                    (Date.now() - new Date(loginStats.lastLogin).getTime()) / 86400000
                  );
                  return daysSince >= 3 ? (
                    <p className="text-xs text-red-600 font-medium mt-1">
                      Inaktiv seit {daysSince} Tagen
                    </p>
                  ) : null;
                })()}
              </>
            ) : (
              <p className="text-sm font-semibold text-gray-400">Nie</p>
            )}
          </div>
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-400 mb-1">Logins letzte 7 Tage</p>
            <p className="text-2xl font-extrabold text-gray-900">
              {loginStats?.last7 ?? '—'}
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-400 mb-1">Logins letzte 30 Tage</p>
            <p className="text-2xl font-extrabold text-gray-900">
              {loginStats?.last30 ?? '—'}
            </p>
          </div>
        </div>

        {/* Call activity today / this week */}
        {(() => {
          const now = Date.now();
          const todayCalls = activityEntries.filter(
            (e) => e.action_type === 'call' && now - new Date(e.created_at).getTime() < 86400000
          ).length;
          const weekCalls = activityEntries.filter(
            (e) => e.action_type === 'call' && now - new Date(e.created_at).getTime() < 7 * 86400000
          ).length;
          return (todayCalls > 0 || weekCalls > 0) ? (
            <div className="flex items-center gap-4 mb-6 text-sm text-gray-600">
              <span>Anrufe heute: <strong className="text-gray-900">{todayCalls}</strong></span>
              <span className="text-gray-300">|</span>
              <span>Anrufe diese Woche: <strong className="text-gray-900">{weekCalls}</strong></span>
            </div>
          ) : null;
        })()}

        {/* Activity feed */}
        <ActivityFeed
          entries={activityEntries}
          compact
          emptyText="Noch keine Aktivitäten für diesen Kunden."
        />
      </Card>

      {/* ── Funnel ─────────────────────────────────────── */}
      <Card padding="lg" className="mb-6">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-6">
          Funnel
        </h2>
        {funnels.length === 0 ? (
          <p className="text-sm text-gray-400">Kein Funnel vorhanden.</p>
        ) : (
          <div className="space-y-4">
            {funnels.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{f.name}</p>
                  {f.url && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{f.url}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <Badge tone={f.status === 'published' ? 'success' : 'neutral'}>
                      {f.status === 'published' ? 'Veröffentlicht' : f.status === 'archived' ? 'Archiviert' : 'Entwurf'}
                    </Badge>
                    <span className="text-xs text-gray-400">
                      {sourceBreakdown.meta} Bewerber aus Meta
                    </span>
                  </div>
                </div>
                {f.url && (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 transition-colors"
                  >
                    <ExternalLink size={13} />
                    Öffnen
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Onboarding Fortschritt ────────────────────────── */}
      <OnboardingProgressSection agencyId={id} />

      {/* Upsell Signals */}
      {upsellSignals.length > 0 && (
        <Card padding="lg" className="!bg-amber-100/50 border border-amber-500/20">
          <h2 className="text-sm font-semibold text-amber-500 uppercase tracking-wide mb-5 flex items-center gap-2">
            <AlertTriangle size={16} />
            Upsell-Signale
          </h2>
          <div className="space-y-4">
            {upsellSignals.map((signal, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <Badge tone="softAccent" className="flex-shrink-0 mt-0.5">!</Badge>
                <span className="text-amber-500 font-medium">{signal}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Playbook Modal ─────────────────────────────── */}
      <Modal
        open={activePlaybook !== null}
        onClose={() => setActivePlaybook(null)}
        title={activePlaybook?.title ?? 'Playbook'}
        width="max-w-2xl"
      >
        {activePlaybook && <PlaybookContent entry={activePlaybook} />}
      </Modal>

      {/* ── KPI Override Modal ─────────────────────────── */}
      <Modal
        open={overrideKpi !== null}
        onClose={() => setOverrideKpi(null)}
        title="KPI-Ziel anpassen"
      >
        {overrideKpi && (
          <OverrideForm
            kpiKey={overrideKpi.key}
            currentValue={overrideKpi.value}
            agencyId={id}
            onDone={() => {
              setOverrideKpi(null);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
