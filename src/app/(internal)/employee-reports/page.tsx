'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import {
  Users, UserCheck, TrendingUp, Phone, Target, Star, AlertTriangle, Loader2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CandidateStats {
  total: number;
  thisWeek: number;
  hired: number;
  hireRate: number;
}

interface CallStats {
  total: number;
  reachRate: number;
  terminRate: number;
}

interface SurveyItem {
  agencyId: string;
  agencyName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

interface SurveyStats {
  items: SurveyItem[];
  avgRating: number | null;
}

interface ProblemItem {
  id: string;
  agency_id: string;
  agencyName: string;
  problem_key: string;
  severity: 'critical' | 'warning';
  current_value: number | null;
  target_value: number | null;
  created_at: string;
}

interface ReportsData {
  agencyIds: string[];
  candidates: CandidateStats;
  calls: CallStats;
  surveys: SurveyStats;
  problems: ProblemItem[];
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'success' | 'highlight';
}) {
  const iconBg =
    tone === 'highlight' ? 'bg-red-100 text-red-600' :
    tone === 'success'   ? 'bg-green-100 text-green-600' :
    'bg-gray-100 text-gray-600';

  return (
    <Card padding="md" className="flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

// ── Star rating ───────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`w-3.5 h-3.5 ${n <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
        />
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EmployeeReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/employee/reports');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-400 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl space-y-8">
        <PageHeader label="REPORTS" title="Reports" description="Übersicht deiner Kunden" />
        <Card padding="md">
          <p className="text-sm text-gray-500">Keine Daten verfügbar.</p>
        </Card>
      </div>
    );
  }

  const { candidates, calls, surveys, problems } = data;

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  const criticalProblems = problems.filter((p) => p.severity === 'critical');
  const warningProblems = problems.filter((p) => p.severity === 'warning');

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        label="REPORTS"
        title="Reports"
        description="KPIs über alle deine zugewiesenen Kunden"
      />

      {/* ── Bewerber-Übersicht ── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Bewerber-Übersicht
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="Bewerber gesamt"
            value={candidates.total}
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Diese Woche"
            value={candidates.thisWeek}
            tone={candidates.thisWeek > 0 ? 'highlight' : 'default'}
          />
          <StatCard
            icon={<UserCheck className="w-5 h-5" />}
            label="Eingestellt"
            value={candidates.hired}
            tone={candidates.hired > 0 ? 'success' : 'default'}
          />
          <StatCard
            icon={<Target className="w-5 h-5" />}
            label="Einstellungsquote"
            value={`${candidates.hireRate}%`}
            tone={candidates.hireRate >= 10 ? 'success' : 'default'}
          />
        </div>
      </section>

      {/* ── Call-Performance ── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Call-Performance
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            icon={<Phone className="w-5 h-5" />}
            label="Calls gesamt"
            value={calls.total}
          />
          <StatCard
            icon={<Phone className="w-5 h-5" />}
            label="Erreichquote"
            value={`${calls.reachRate}%`}
            tone={calls.reachRate >= 50 ? 'success' : calls.reachRate > 0 ? 'highlight' : 'default'}
          />
          <StatCard
            icon={<Phone className="w-5 h-5" />}
            label="Terminquote"
            value={`${calls.terminRate}%`}
            tone={calls.terminRate >= 20 ? 'success' : calls.terminRate > 0 ? 'highlight' : 'default'}
          />
        </div>
      </section>

      {/* ── Kundenzufriedenheit ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Kundenzufriedenheit
          </h2>
          {surveys.avgRating !== null && (
            <div className="flex items-center gap-2">
              <StarRating rating={Math.round(surveys.avgRating)} />
              <span className="text-sm font-bold text-gray-900">{surveys.avgRating}</span>
              <span className="text-xs text-gray-400">Ø Bewertung</span>
            </div>
          )}
        </div>

        {surveys.items.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-gray-400">Noch keine Umfrage-Antworten.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {surveys.items.map((s) => (
              <Card key={s.agencyId} padding="md">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{s.agencyName}</p>
                    {s.comment && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.comment}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{formatDate(s.createdAt)}</p>
                  </div>
                  <div className="flex-shrink-0">
                    <StarRating rating={s.rating} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Problem-Kunden ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Problem-Kunden
          </h2>
          {criticalProblems.length > 0 && (
            <Badge tone="accent">{criticalProblems.length} Kritisch</Badge>
          )}
          {warningProblems.length > 0 && (
            <Badge tone="neutral" className="!bg-amber-100 !text-amber-700">
              {warningProblems.length} Warnung
            </Badge>
          )}
        </div>

        {problems.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-gray-400">Keine aktiven Probleme.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {problems.map((p) => (
              <Card
                key={p.id}
                padding="md"
                className={p.severity === 'critical' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-amber-400'}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className={`w-4 h-4 mt-0.5 flex-shrink-0 ${p.severity === 'critical' ? 'text-red-600' : 'text-amber-500'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{p.agencyName}</span>
                      <Badge tone={p.severity === 'critical' ? 'accent' : 'neutral'} className={p.severity !== 'critical' ? '!bg-amber-100 !text-amber-700' : ''}>
                        {p.severity === 'critical' ? 'Kritisch' : 'Warnung'}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {p.problem_key.replace(/_/g, ' ')}
                    </p>
                    {(p.current_value !== null || p.target_value !== null) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {p.current_value !== null && `Aktuell: ${p.current_value}`}
                        {p.current_value !== null && p.target_value !== null && ' · '}
                        {p.target_value !== null && `Ziel: ${p.target_value}`}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
