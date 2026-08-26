'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import {
  ArrowLeft, TrendingUp, Minus, Activity, ListChecks,
  Stethoscope, Sparkles, ClipboardList, AlertTriangle, CheckCircle,
  Clock, BookOpen, Printer, ArrowUpRight, ArrowDownRight, ShieldAlert,
  User, Users, Wrench,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────── */

interface PeriodData {
  new_candidates: number;
  contacted: number;
  interviews: number;
  trials: number;
  hired: number;
  median_ttfc_seconds: number | null;
}

interface Deltas {
  new_candidates: number | null;
  contacted: number | null;
  interviews: number | null;
  trials: number | null;
  hired: number | null;
  median_ttfc_seconds: number | null;
}

interface ActivityGroup {
  type: string;
  count: number;
  recent: { action: string; created_at: string }[];
}

interface OpenItems {
  fulfillment_tasks: { id: string; title: string; status: string; task_type: string }[];
  problems: { id: string; problem_key: string; severity: string; current_value: number | null; target_value: number | null }[];
  masterclass: { completed: number; total: number };
  sla: { median_ttfc_seconds: number | null; target_seconds: number; status: 'green' | 'yellow' | 'red' };
}

interface Diagnose {
  bottleneck: string;
  detail: string;
  severity: 'green' | 'yellow' | 'red';
}

interface UpsellSuggestion {
  product: string;
  trigger: string;
  price: string;
}

interface Upsell {
  blocked: boolean;
  reason?: string;
  suggestions: UpsellSuggestion[];
}

interface NextStep {
  action: string;
  owner: 'kunde' | 'team' | 'felix';
  deadline: string;
}

interface FahrplanData {
  agency: { id: string; name: string; contact_name: string; created_at: string };
  generated_at: string;
  betreuungsstufe: 'A' | 'B';
  days_active: number;
  period: {
    current: { start: string; end: string };
    previous: { start: string; end: string };
  };
  zahlen: { current: PeriodData; previous: PeriodData; deltas: Deltas };
  activities: ActivityGroup[];
  open_items: OpenItems;
  diagnose: Diagnose;
  upsell: Upsell;
  next_steps: NextStep[];
}

/* ── Helpers ───────────────────────────────────────────────── */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTtfc(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 3600) return `${Math.round(seconds / 60)} Min.`;
  return `${Math.round(seconds / 3600)} Std.`;
}

function DeltaIndicator({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-xs text-gray-400">—</span>;
  const isPositive = invert ? value < 0 : value > 0;
  const isNeutral = value === 0;

  if (isNeutral) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-gray-400">
        <Minus size={12} />
        0%
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {value > 0 ? '+' : ''}{value}%
    </span>
  );
}

const activityTypeLabels: Record<string, string> = {
  login: 'Logins',
  call: 'Anrufe',
  stage_change: 'Status-Wechsel',
  note: 'Notizen',
  content_approval: 'Freigaben',
  content_rejection: 'Ablehnungen',
  recording_upload: 'Aufnahmen',
  onboarding_complete: 'Onboarding',
  survey_submitted: 'Umfragen',
  funnel_published: 'Funnel veröffentlicht',
  candidate_created: 'Neue Bewerber',
  invite_sent: 'Einladungen',
  email_sent: 'E-Mails',
  task_completed: 'Aufgaben erledigt',
  other: 'Sonstiges',
};

const ownerLabels: Record<string, { label: string; tone: 'accent' | 'success' | 'neutral' }> = {
  kunde: { label: 'Kunde', tone: 'neutral' },
  team: { label: 'Team', tone: 'success' },
  felix: { label: 'Felix', tone: 'accent' },
};

const ownerIcons: Record<string, React.ReactNode> = {
  kunde: <User size={12} />,
  team: <Users size={12} />,
  felix: <Wrench size={12} />,
};

/* ── Component ─────────────────────────────────────────────── */

export function FahrplanClient({ agencyId }: { agencyId: string }) {
  const [data, setData] = useState<FahrplanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/fahrplan/${agencyId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Laden fehlgeschlagen');
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [agencyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card padding="lg" className="text-center">
        <p className="text-gray-600">{error ?? 'Fahrplan konnte nicht geladen werden.'}</p>
      </Card>
    );
  }

  const { zahlen, activities, open_items, diagnose, upsell, next_steps } = data;

  const severityBorderColor = {
    green: 'border-green-400',
    yellow: 'border-amber-400',
    red: 'border-red-500',
  };

  const severityBgColor = {
    green: 'bg-green-50',
    yellow: 'bg-amber-50',
    red: 'bg-red-50',
  };

  const severityTextColor = {
    green: 'text-green-700',
    yellow: 'text-amber-700',
    red: 'text-red-700',
  };

  const zahlenRows = [
    { label: 'Neue Bewerbungen', current: zahlen.current.new_candidates, previous: zahlen.previous.new_candidates, delta: zahlen.deltas.new_candidates },
    { label: 'Kontaktiert', current: zahlen.current.contacted, previous: zahlen.previous.contacted, delta: zahlen.deltas.contacted },
    { label: 'Vorstellungsgespräche', current: zahlen.current.interviews, previous: zahlen.previous.interviews, delta: zahlen.deltas.interviews },
    { label: 'Probetage', current: zahlen.current.trials, previous: zahlen.previous.trials, delta: zahlen.deltas.trials },
    { label: 'Einstellungen', current: zahlen.current.hired, previous: zahlen.previous.hired, delta: zahlen.deltas.hired },
  ];

  return (
    <div className="max-w-4xl print:max-w-none">
      {/* Back link */}
      <Link
        href={`/clients/${agencyId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-500 transition-colors mb-6 print:hidden"
      >
        <ArrowLeft size={14} />
        Zurück zum Kunden
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <PageHeader
          label="FAHRPLAN"
          title={data.agency.name}
          description={`${data.agency.contact_name} · Generiert am ${formatDate(data.generated_at)}`}
        />
        <div className="flex items-center gap-3 print:hidden">
          <Badge tone={data.betreuungsstufe === 'A' ? 'accent' : 'neutral'}>
            Stufe {data.betreuungsstufe}
          </Badge>
          <span className="text-xs text-gray-400">
            {data.days_active} Tage aktiv
          </span>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-red-600 transition-colors"
          >
            <Printer size={14} />
            Drucken
          </button>
        </div>
      </div>

      {/* ── Section 1: Zahlen ─────────────────────────────── */}
      <Card padding="lg" className="mb-6 print:shadow-none print:border-gray-300">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp size={16} className="text-red-600" />
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">
            Zahlen der letzten 14 Tage
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-400 uppercase">Metrik</th>
                <th className="text-right py-2 px-4 text-xs font-semibold text-gray-400 uppercase">Aktuell</th>
                <th className="text-right py-2 px-4 text-xs font-semibold text-gray-400 uppercase">Vorperiode</th>
                <th className="text-right py-2 pl-4 text-xs font-semibold text-gray-400 uppercase">Trend</th>
              </tr>
            </thead>
            <tbody>
              {zahlenRows.map((row) => (
                <tr key={row.label} className="border-b border-gray-100">
                  <td className="py-3 pr-4 font-medium text-gray-900">{row.label}</td>
                  <td className="py-3 px-4 text-right font-bold text-gray-900">{row.current}</td>
                  <td className="py-3 px-4 text-right text-gray-500">{row.previous}</td>
                  <td className="py-3 pl-4 text-right">
                    <DeltaIndicator value={row.delta} />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-3 pr-4 font-medium text-gray-900">Erstkontakt-Median</td>
                <td className="py-3 px-4 text-right font-bold text-gray-900">
                  {formatTtfc(zahlen.current.median_ttfc_seconds)}
                </td>
                <td className="py-3 px-4 text-right text-gray-500">
                  {formatTtfc(zahlen.previous.median_ttfc_seconds)}
                </td>
                <td className="py-3 pl-4 text-right">
                  <DeltaIndicator value={zahlen.deltas.median_ttfc_seconds} invert />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Section 2: Aktivitäten ─────────────────────────── */}
      <Card padding="lg" className="mb-6 print:shadow-none print:border-gray-300">
        <div className="flex items-center gap-2 mb-5">
          <Activity size={16} className="text-red-600" />
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">
            Was wir gemacht haben
          </h2>
        </div>

        {activities.length === 0 ? (
          <p className="text-sm text-gray-400">Keine Aktivitäten in den letzten 14 Tagen.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activities.map((group) => (
              <div key={group.type} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-bold">{group.count}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {activityTypeLabels[group.type] ?? group.type}
                  </p>
                  {group.recent[0] && (
                    <p className="text-xs text-gray-500 truncate">
                      Zuletzt: {group.recent[0].action}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Section 3: Offene Punkte ───────────────────────── */}
      <Card padding="lg" className="mb-6 print:shadow-none print:border-gray-300">
        <div className="flex items-center gap-2 mb-5">
          <ListChecks size={16} className="text-red-600" />
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">
            Was beim Kunden offen ist
          </h2>
        </div>

        <div className="space-y-4">
          {/* Open fulfillment tasks */}
          {open_items.fulfillment_tasks.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Offene Aufgaben ({open_items.fulfillment_tasks.length})
              </h3>
              <div className="space-y-1.5">
                {open_items.fulfillment_tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 text-sm">
                    <Clock size={12} className="text-gray-400 shrink-0" />
                    <span className="text-gray-900">{task.title}</span>
                    <Badge tone="neutral" className="ml-auto text-xs">{task.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active problems */}
          {open_items.problems.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Aktive Probleme ({open_items.problems.length})
              </h3>
              <div className="space-y-1.5">
                {open_items.problems.map((problem) => (
                  <div key={problem.id} className="flex items-center gap-2 text-sm">
                    <AlertTriangle
                      size={12}
                      className={problem.severity === 'critical' ? 'text-red-500 shrink-0' : 'text-amber-500 shrink-0'}
                    />
                    <span className="text-gray-900">{problem.problem_key.replace(/_/g, ' ')}</span>
                    <Badge tone={problem.severity === 'critical' ? 'accent' : 'neutral'} className="ml-auto text-xs">
                      {problem.severity === 'critical' ? 'Kritisch' : 'Warnung'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Masterclass */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Masterclass
            </h3>
            <div className="flex items-center gap-3">
              <BookOpen size={14} className="text-gray-400" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-900">
                    {open_items.masterclass.completed} / {open_items.masterclass.total} Lektionen
                  </span>
                  <span className="text-xs text-gray-400">
                    {open_items.masterclass.total > 0
                      ? Math.round((open_items.masterclass.completed / open_items.masterclass.total) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-600 rounded-full transition-all"
                    style={{
                      width: `${open_items.masterclass.total > 0
                        ? (open_items.masterclass.completed / open_items.masterclass.total) * 100
                        : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SLA Status */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              SLA Erstkontakt
            </h3>
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${severityBorderColor[open_items.sla.status]} ${severityBgColor[open_items.sla.status]}`}>
              {open_items.sla.status === 'green' ? (
                <CheckCircle size={16} className="text-green-600 shrink-0" />
              ) : open_items.sla.status === 'yellow' ? (
                <Clock size={16} className="text-amber-500 shrink-0" />
              ) : (
                <ShieldAlert size={16} className="text-red-600 shrink-0" />
              )}
              <div>
                <p className={`text-sm font-semibold ${severityTextColor[open_items.sla.status]}`}>
                  {open_items.sla.status === 'green' ? 'Im Ziel' : open_items.sla.status === 'yellow' ? 'Knapp' : 'Ueberschritten'}
                </p>
                <p className="text-xs text-gray-600">
                  Median: {formatTtfc(open_items.sla.median_ttfc_seconds)} / Ziel: {formatTtfc(open_items.sla.target_seconds)}
                </p>
              </div>
            </div>
          </div>

          {/* Empty state */}
          {open_items.fulfillment_tasks.length === 0 && open_items.problems.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <CheckCircle size={14} />
              <span>Keine offenen Aufgaben oder Probleme.</span>
            </div>
          )}
        </div>
      </Card>

      {/* ── Section 4: Diagnose ────────────────────────────── */}
      <Card
        padding="lg"
        className={`mb-6 border-l-4 ${severityBorderColor[diagnose.severity]} print:shadow-none print:border-gray-300 print:border-l-4 print:${severityBorderColor[diagnose.severity]}`}
      >
        <div className="flex items-center gap-2 mb-4">
          <Stethoscope size={16} className="text-red-600" />
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">
            Diagnose
          </h2>
          <Badge
            tone={diagnose.severity === 'green' ? 'success' : diagnose.severity === 'yellow' ? 'neutral' : 'accent'}
            className="ml-auto"
          >
            {diagnose.severity === 'green' ? 'Gruen' : diagnose.severity === 'yellow' ? 'Gelb' : 'Rot'}
          </Badge>
        </div>
        <p className={`text-lg font-bold ${severityTextColor[diagnose.severity]} mb-2`}>
          {diagnose.bottleneck}
        </p>
        <p className="text-sm text-gray-600">{diagnose.detail}</p>
      </Card>

      {/* ── Section 5: Upsell-Fokus ────────────────────────── */}
      <Card padding="lg" className="mb-6 print:shadow-none print:border-gray-300">
        <div className="flex items-center gap-2 mb-5">
          <Sparkles size={16} className="text-red-600" />
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">
            Upsell-Fokus
          </h2>
        </div>

        {upsell.blocked ? (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <ShieldAlert size={18} className="text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-700">Kein Upsell</p>
              <p className="text-xs text-red-600">{upsell.reason}</p>
            </div>
          </div>
        ) : upsell.suggestions.length === 0 ? (
          <p className="text-sm text-gray-400">Aktuell keine Upsell-Signale erkannt.</p>
        ) : (
          <div className="space-y-3">
            {upsell.suggestions.map((suggestion, i) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-900">{suggestion.product}</p>
                    <Badge tone="softAccent" className="text-xs">{suggestion.price}</Badge>
                  </div>
                  <p className="text-xs text-gray-600">{suggestion.trigger}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Section 6: Nächste Schritte ────────────────────── */}
      <Card padding="lg" className="mb-6 print:shadow-none print:border-gray-300">
        <div className="flex items-center gap-2 mb-5">
          <ClipboardList size={16} className="text-red-600" />
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">
            Drei nächste Schritte
          </h2>
        </div>

        {next_steps.length === 0 ? (
          <p className="text-sm text-gray-400">Keine Schritte generiert.</p>
        ) : (
          <div className="space-y-4">
            {next_steps.map((step, i) => {
              const ownerConfig = ownerLabels[step.owner] ?? ownerLabels.team;
              return (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 text-sm font-bold">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 mb-1">{step.action}</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge tone={ownerConfig.tone} className="text-xs">
                        <span className="inline-flex items-center gap-1">
                          {ownerIcons[step.owner]}
                          {ownerConfig.label}
                        </span>
                      </Badge>
                      <span className="text-xs text-gray-500">
                        Bis: {formatDate(step.deadline)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Print styles ───────────────────────────────────── */}
      <style>{`
        @media print {
          body { background: white !important; }
          nav, .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border-gray-300 { border-color: #d1d5db !important; }
          .print\\:max-w-none { max-width: none !important; }
        }
      `}</style>
    </div>
  );
}
