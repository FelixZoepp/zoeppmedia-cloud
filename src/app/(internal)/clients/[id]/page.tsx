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
  BookOpen, CheckCircle, ChevronRight, Target,
} from 'lucide-react';
import type { Agency, AgencyProblem, PlaybookEntry } from '@/lib/types/database';

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

/* ── KPI Progress Bar ────────────────────────────────────── */

function KpiBar({ kpi, onOverride }: { kpi: KpiItem; onOverride: (key: string, current: number) => void }) {
  const ratio = kpi.defaultValue > 0 ? kpi.value / kpi.defaultValue : 0;
  const isGood =
    kpi.direction === 'higher_is_better' ? ratio >= 1 : ratio <= 1;
  const barWidth = Math.min(ratio * 100, 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-[var(--text-primary)]">{kpi.label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[var(--text-tertiary)]">
            Ist: <span className="font-semibold text-[var(--text-primary)]">{kpi.value}{kpi.unit}</span>
          </span>
          <span className="text-[12px] text-[var(--text-tertiary)]">
            Soll: <span className="font-semibold">{kpi.defaultValue}{kpi.unit}</span>
          </span>
          {kpi.isOverride && (
            <Badge tone="softAccent" className="text-[10px] py-0.5 px-2">Individuell</Badge>
          )}
          <button
            onClick={() => onOverride(kpi.key, kpi.value)}
            className="text-[11px] font-semibold text-red-500 hover:text-red-600 uppercase tracking-wide transition-colors"
          >
            Ziel anpassen
          </button>
        </div>
      </div>
      <div className="w-full h-2.5 bg-[var(--surface-inset)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isGood ? 'bg-green-500' : 'bg-red-500'}`}
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
      className={`flex items-start gap-5 p-6 rounded-[var(--radius-md)] border ${
        isCritical
          ? 'bg-red-50 border-red-200'
          : 'bg-amber-50 border-amber-200'
      }`}
    >
      <AlertTriangle
        size={16}
        className={`mt-0.5 shrink-0 ${isCritical ? 'text-red-500' : 'text-amber-500'}`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[13px] font-semibold ${isCritical ? 'text-red-700' : 'text-amber-700'}`}>
            {problem.problem_key.replace(/_/g, ' ')}
          </span>
          <Badge tone={isCritical ? 'accent' : 'neutral'} className="text-[10px] py-0.5 px-2">
            {isCritical ? 'Kritisch' : 'Warnung'}
          </Badge>
        </div>
        {(problem.current_value !== null || problem.target_value !== null) && (
          <p className="text-[12px] text-[var(--text-secondary)] mb-2">
            {problem.current_value !== null && `Aktuell: ${problem.current_value}`}
            {problem.current_value !== null && problem.target_value !== null && ' · '}
            {problem.target_value !== null && `Ziel: ${problem.target_value}`}
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {playbook && (
            <button
              onClick={() => onPlaybook(playbook)}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-red-600 hover:text-red-700 transition-colors"
            >
              <BookOpen size={12} />
              Playbook anzeigen
            </button>
          )}
          <button
            onClick={() => onResolve(problem.id)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-green-700 hover:text-green-800 transition-colors"
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
      <p className="text-[14px] text-[var(--text-secondary)]">{entry.description}</p>

      {entry.causes.length > 0 && (
        <div>
          <h3 className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Mögliche Ursachen</h3>
          <ul className="space-y-1.5">
            {entry.causes.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--text-primary)]">
                <ChevronRight size={14} className="text-red-500 mt-0.5 shrink-0" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.immediate_actions.length > 0 && (
        <div>
          <h3 className="text-[12px] font-bold text-amber-600 uppercase tracking-wide mb-2">Sofortmaßnahmen</h3>
          <ul className="space-y-1.5">
            {entry.immediate_actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--text-primary)]">
                <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
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
          <h3 className="text-[12px] font-bold text-green-700 uppercase tracking-wide mb-2">Langfristige Maßnahmen</h3>
          <ul className="space-y-1.5">
            {entry.long_term_actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--text-primary)]">
                <span className="w-4 h-4 rounded-full bg-green-100 text-green-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.escalation_trigger && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-[var(--radius-md)]">
          <h3 className="text-[11px] font-bold text-red-600 uppercase tracking-wide mb-1">Eskalation wenn</h3>
          <p className="text-[13px] text-red-700">{entry.escalation_trigger}</p>
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
      <p className="text-[14px] text-[var(--text-secondary)]">
        Neues Ziel für <strong>{kpiKey.replace(/_/g, ' ')}</strong> festlegen.
      </p>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full px-5 py-4 border border-[var(--border-default)] rounded-[var(--radius-md)] text-[15px] text-[var(--text-primary)] bg-white shadow-[var(--shadow-xs)] outline-none"
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
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card padding="lg" className="text-center">
        <p className="text-[var(--text-secondary)]">Agentur nicht gefunden.</p>
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
    'var(--red-500)', 'var(--red-400)', 'var(--red-300)',
    'var(--red-200)', 'var(--red-100)', 'var(--gray-300)',
  ];

  const criticalCount = problems.filter((p) => p.severity === 'critical').length;
  const warningCount = problems.filter((p) => p.severity === 'warning').length;

  return (
    <div>
      {/* Back link + header */}
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-[var(--text-sm)] text-[var(--text-secondary)] hover:text-red-500 transition-colors mb-8"
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
        <Card padding="lg" className="mb-10 !border-red-200">
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle size={16} className="text-red-500 shrink-0" />
            <h2 className="text-[14px] font-bold text-red-600 uppercase tracking-wide">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
        {summaryKpis.map((kpi) => (
          <Card key={kpi.label} padding="md">
            <div className="flex items-center gap-5 mb-5">
              <div className={`w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center ${
                kpi.accent ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-500'
              }`}>
                {kpi.icon}
              </div>
              <span className="text-[var(--text-sm)] text-[var(--text-secondary)] font-medium">
                {kpi.label}
              </span>
            </div>
            <p className={`text-3xl font-extrabold tracking-[var(--tracking-heading)] ${
              kpi.accent ? 'text-green-700' : 'text-[var(--text-primary)]'
            }`}>
              {kpi.value}
            </p>
          </Card>
        ))}
      </div>

      {/* ── KPI Soll/Ist Bars ──────────────────────────── */}
      {kpis.length > 0 && (
        <Card padding="lg" className="mb-10">
          <div className="flex items-center gap-2 mb-8">
            <Target size={16} className="text-red-500" />
            <h2 className="text-[14px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
              KPI Soll / Ist
            </h2>
          </div>
          <div className="space-y-8">
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
      <Card padding="lg" className="mb-10">
        <h2 className="text-[var(--text-sm)] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-8">
          Conversion Funnel
        </h2>
        <div className="space-y-6">
          {funnel?.map((f, index) => {
            const maxCount = Math.max(...(funnel?.map((x) => x.count) || [1]), 1);
            const width = Math.max((f.count / maxCount) * 100, 4);
            const barColor = funnelColors[index] || funnelColors[funnelColors.length - 1];
            return (
              <div key={f.stage} className="flex items-center gap-5">
                <span className="text-[var(--text-sm)] text-[var(--text-secondary)] w-44 flex-shrink-0 font-medium">
                  {f.stage}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center px-3 transition-all duration-500"
                    style={{ width: `${width}%`, backgroundColor: barColor }}
                  >
                    <span className="text-[var(--text-sm)] font-semibold text-white drop-shadow-sm">
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
      <Card padding="lg" className="mb-10">
        <h2 className="text-[var(--text-sm)] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-8">
          Quellen
        </h2>
        <div className="grid grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-red-50 flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl font-extrabold text-red-500">{sourceBreakdown.meta}</span>
            </div>
            <p className="text-[var(--text-sm)] text-[var(--text-secondary)] font-medium">Meta</p>
          </div>
          <div className="text-center">
            <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-red-50 flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl font-extrabold text-red-500">{sourceBreakdown.indeed}</span>
            </div>
            <p className="text-[var(--text-sm)] text-[var(--text-secondary)] font-medium">Indeed</p>
          </div>
          <div className="text-center">
            <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-gray-100 flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl font-extrabold text-[var(--text-primary)]">{sourceBreakdown.manual}</span>
            </div>
            <p className="text-[var(--text-sm)] text-[var(--text-secondary)] font-medium">Manuell</p>
          </div>
        </div>
      </Card>

      {/* Activity */}
      <Card padding="lg" className="mb-10">
        <h2 className="text-[var(--text-sm)] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-5">
          Aktivitat
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-[var(--text-secondary)] text-[var(--text-sm)]">Letzter Login:</span>
          {lastLogin ? (
            <Badge tone="success">
              {new Date(lastLogin).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Badge>
          ) : (
            <Badge tone="outline">Nie</Badge>
          )}
        </div>
      </Card>

      {/* Upsell Signals */}
      {upsellSignals.length > 0 && (
        <Card padding="lg" className="!bg-amber-100/50 border border-amber-500/20">
          <h2 className="text-[var(--text-sm)] font-semibold text-amber-500 uppercase tracking-wide mb-5 flex items-center gap-2">
            <AlertTriangle size={16} />
            Upsell-Signale
          </h2>
          <div className="space-y-5">
            {upsellSignals.map((signal, i) => (
              <div key={i} className="flex items-start gap-2.5 text-[var(--text-sm)]">
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
