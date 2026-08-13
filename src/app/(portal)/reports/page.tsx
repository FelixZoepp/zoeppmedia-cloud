'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import {
  BarChart3, Users, UserCheck, TrendingUp, Percent,
  Calendar, Star, MessageSquare, Send, Phone, Target, Clock, Euro,
  MousePointer, Eye, Megaphone,
} from 'lucide-react';

interface FunnelStage {
  id: string;
  name: string;
  sort_order: number;
  color: string;
  count: number;
}

interface CallKpis {
  totalCalls: number;
  reachRate: number;
  terminRate: number;
  avgResponseHours: number | null;
}

interface MetaKpis {
  totalSpend: number;
  totalLeads: number;
  avgCpl: number;
  totalImpressions: number;
  totalClicks: number;
}

interface KpiItem {
  key: string;
  label: string;
  value: number;
  unit: string;
  direction: 'lower_is_better' | 'higher_is_better';
  isOverride: boolean;
  defaultValue: number;
}

interface ReportData {
  agencyId: string;
  total: number;
  last30: number;
  last7: number;
  hired: number;
  hireRate: number;
  funnel: FunnelStage[];
  sources: { meta: number; indeed: number; manual: number };
  callKpis: CallKpis;
  metaKpis: MetaKpis | null;
}

interface SurveyTemplate {
  id: string;
  title: string;
  description: string | null;
  questions: { id: string; type: string; label: string }[];
}

const PERIOD_OPTIONS = [
  { value: 'this_week', label: 'Diese Woche' },
  { value: 'this_month', label: 'Dieser Monat' },
  { value: 'last_month', label: 'Letzter Monat' },
  { value: 'all', label: 'Gesamt' },
];

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [kpis, setKpis] = useState<KpiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [showSurvey, setShowSurvey] = useState(false);
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fetch report data whenever period changes
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/reports?period=${period}`).then((r) => r.json()),
      fetch('/api/surveys').then((r) => r.json()),
    ]).then(([reportData, surveyData]) => {
      setData(reportData);
      setTemplates(surveyData.templates);
      setLoading(false);
      // Fetch KPIs once we have the agencyId
      if (reportData.agencyId) {
        fetch(`/api/kpi/agency/${reportData.agencyId}`)
          .then((r) => r.json())
          .then((kpiData: KpiItem[]) => setKpis(Array.isArray(kpiData) ? kpiData : []));
      }
    });
  }, [period]);

  async function submitSurvey() {
    if (!templates[0]) return;
    setSubmitting(true);
    const avgRating = Object.values(ratings).length > 0
      ? Math.round(Object.values(ratings).reduce((a, b) => a + b, 0) / Object.values(ratings).length)
      : null;

    await fetch('/api/surveys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: templates[0].id,
        rating: avgRating,
        answers: ratings,
        comment,
      }),
    });

    setSurveySubmitted(true);
    setSubmitting(false);
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-[#E31B23] rounded-full animate-spin" />
      </div>
    );
  }

  const maxFunnel = Math.max(...data.funnel.map((s) => s.count), 1);
  const totalSources = data.sources.meta + data.sources.indeed + data.sources.manual;

  return (
    <div>
      <PageHeader
        label="ANALYTICS"
        title="Reports"
        description="Deine Recruiting-Performance auf einen Blick"
        action={
          <Button variant="soft" onClick={() => setShowSurvey(true)}>
            <Star className="w-4 h-4" /> Feedback geben
          </Button>
        }
      />

      {/* Period filter */}
      <div className="mb-8">
        <SegmentedControl
          items={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
        />
      </div>

      {/* Pipeline KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {[
          { label: 'Bewerber gesamt', value: data.total, icon: Users, color: 'bg-red-50 text-[#E31B23]' },
          { label: 'Letzte 30 Tage', value: data.last30, icon: Calendar, color: 'bg-red-50 text-[#E31B23]' },
          { label: 'Eingestellt', value: data.hired, icon: UserCheck, color: 'bg-green-100 text-green-700' },
          { label: 'Einstellungsrate', value: `${data.hireRate}%`, icon: Percent, color: 'bg-amber-100 text-amber-500' },
        ].map((kpi) => (
          <Card key={kpi.label} padding="md">
            <div className="flex items-center gap-5 mb-5">
              <div className={`w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center ${kpi.color}`}>
                <kpi.icon className="w-5 h-5" />
              </div>
              <span className="text-[13px] font-medium text-[var(--text-secondary)]">{kpi.label}</span>
            </div>
            <p className="text-[28px] font-bold text-[var(--text-primary)]">{kpi.value}</p>
          </Card>
        ))}
      </div>

      {/* KPI Soll/Ist Section */}
      {kpis.length > 0 && (
        <div className="space-y-5 mb-8">
          <h2 className="text-[18px] font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Target className="w-5 h-5 text-[#E31B23]" /> Ziel-Erreichung
          </h2>
          <Card padding="md">
            <div className="space-y-5">
              {kpis.map((kpi) => {
                const ratio = kpi.defaultValue > 0 ? kpi.value / kpi.defaultValue : 0;
                const isGood =
                  kpi.direction === 'higher_is_better' ? ratio >= 1 : ratio <= 1;
                const barWidth = Math.min(ratio * 100, 100);
                return (
                  <div key={kpi.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">{kpi.label}</span>
                      <span className="text-[12px] text-[var(--text-tertiary)]">
                        <span className="font-semibold text-[var(--text-primary)]">{kpi.value}{kpi.unit}</span>
                        {' / '}
                        <span>Ziel {kpi.defaultValue}{kpi.unit}</span>
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-[var(--surface-inset)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isGood ? 'bg-green-500' : 'bg-red-400'}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Call Performance Section */}
      <div className="space-y-5 mb-8">
        <h2 className="text-[18px] font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Phone className="w-5 h-5 text-[#E31B23]" /> Call-Performance
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <Card padding="md">
            <div className="flex items-center gap-5 mb-5">
              <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center bg-red-50 text-[#E31B23]">
                <Phone className="w-5 h-5" />
              </div>
              <span className="text-[13px] font-medium text-[var(--text-secondary)]">Anrufe gesamt</span>
            </div>
            <p className="text-[28px] font-bold text-[var(--text-primary)]">{data.callKpis.totalCalls}</p>
          </Card>
          <Card padding="md">
            <div className="flex items-center gap-5 mb-5">
              <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center bg-green-100 text-green-700">
                <Target className="w-5 h-5" />
              </div>
              <span className="text-[13px] font-medium text-[var(--text-secondary)]">Erreichbarkeit</span>
            </div>
            <p className="text-[28px] font-bold text-[var(--text-primary)]">{data.callKpis.reachRate}%</p>
          </Card>
          <Card padding="md">
            <div className="flex items-center gap-5 mb-5">
              <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center bg-amber-100 text-amber-500">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-[13px] font-medium text-[var(--text-secondary)]">Termin-Quote</span>
            </div>
            <p className="text-[28px] font-bold text-[var(--text-primary)]">{data.callKpis.terminRate}%</p>
          </Card>
          <Card padding="md">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center bg-red-50 text-[#E31B23]">
                <Clock className="w-5 h-5" />
              </div>
              <span className="text-[13px] font-medium text-[var(--text-secondary)]">Ø Reaktionszeit</span>
            </div>
            <p className="text-[28px] font-bold text-[var(--text-primary)]">
              {data.callKpis.avgResponseHours !== null ? `${data.callKpis.avgResponseHours}h` : '–'}
            </p>
          </Card>
        </div>
      </div>

      {/* Meta Ads Section — only when data exists */}
      {data.metaKpis && (
        <div className="space-y-5 mb-8">
          <h2 className="text-[18px] font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-[#E31B23]" /> Meta Ads
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-5">
            <Card padding="md">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center bg-red-50 text-[#E31B23]">
                  <Euro className="w-5 h-5" />
                </div>
                <span className="text-[13px] font-medium text-[var(--text-secondary)]">Ausgaben</span>
              </div>
              <p className="text-[28px] font-bold text-[var(--text-primary)]">
                €{data.metaKpis.totalSpend.toFixed(2)}
              </p>
            </Card>
            <Card padding="md">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center bg-green-100 text-green-700">
                  <Users className="w-5 h-5" />
                </div>
                <span className="text-[13px] font-medium text-[var(--text-secondary)]">Leads</span>
              </div>
              <p className="text-[28px] font-bold text-[var(--text-primary)]">{data.metaKpis.totalLeads}</p>
            </Card>
            <Card padding="md">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center bg-amber-100 text-amber-500">
                  <Target className="w-5 h-5" />
                </div>
                <span className="text-[13px] font-medium text-[var(--text-secondary)]">Ø CPL</span>
              </div>
              <p className="text-[28px] font-bold text-[var(--text-primary)]">
                €{data.metaKpis.avgCpl.toFixed(2)}
              </p>
            </Card>
            <Card padding="md">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center bg-red-50 text-[#E31B23]">
                  <Eye className="w-5 h-5" />
                </div>
                <span className="text-[13px] font-medium text-[var(--text-secondary)]">Impressions</span>
              </div>
              <p className="text-[28px] font-bold text-[var(--text-primary)]">
                {data.metaKpis.totalImpressions.toLocaleString('de-DE')}
              </p>
            </Card>
            <Card padding="md">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center bg-green-100 text-green-700">
                  <MousePointer className="w-5 h-5" />
                </div>
                <span className="text-[13px] font-medium text-[var(--text-secondary)]">Klicks</span>
              </div>
              <p className="text-[28px] font-bold text-[var(--text-primary)]">
                {data.metaKpis.totalClicks.toLocaleString('de-DE')}
              </p>
            </Card>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Conversion Funnel */}
        <Card padding="md">
          <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-5 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#E31B23]" /> Conversion Funnel
          </h2>
          <div className="space-y-5">
            {data.funnel.map((stage) => (
              <div key={stage.id} className="flex items-center gap-3">
                <span className="text-[13px] font-medium text-[var(--text-secondary)] w-36 truncate">{stage.name}</span>
                <div className="flex-1 h-8 bg-[var(--surface-inset)] rounded-[var(--radius-sm)] overflow-hidden">
                  <div
                    className="h-full rounded-[var(--radius-sm)] transition-all flex items-center px-3"
                    style={{
                      width: `${Math.max((stage.count / maxFunnel) * 100, 8)}%`,
                      backgroundColor: stage.color,
                    }}
                  >
                    <span className="text-[13px] font-semibold text-white">{stage.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Source Breakdown */}
        <Card padding="md">
          <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-5 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#E31B23]" /> Quellen
          </h2>
          <div className="grid grid-cols-3 gap-5">
            {[
              { label: 'Meta', value: data.sources.meta, color: 'bg-red-50 text-[#C00015]' },
              { label: 'Indeed', value: data.sources.indeed, color: 'bg-green-100 text-green-700' },
              { label: 'Manuell', value: data.sources.manual, color: 'bg-[var(--surface-inset)] text-[var(--text-secondary)]' },
            ].map((source) => (
              <div key={source.label} className="text-center">
                <div className={`w-16 h-16 rounded-[var(--radius-lg)] ${source.color} flex items-center justify-center mx-auto mb-2`}>
                  <span className="text-[22px] font-bold">{source.value}</span>
                </div>
                <p className="text-[13px] font-medium text-[var(--text-secondary)]">{source.label}</p>
                {totalSources > 0 && (
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    {Math.round((source.value / totalSources) * 100)}%
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Satisfaction Survey Modal */}
      <Modal open={showSurvey} onClose={() => setShowSurvey(false)} title="Wie zufrieden bist du?">
        {surveySubmitted ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Star className="w-8 h-8 text-green-700" />
            </div>
            <h3 className="text-[18px] font-bold text-[var(--text-primary)] mb-2">Danke für dein Feedback!</h3>
            <p className="text-[var(--text-secondary)]">Wir nutzen es, um noch besser zu werden.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {templates[0]?.questions.map((q) => (
              <div key={q.id}>
                <label className="block text-[15px] font-medium text-[var(--text-primary)] mb-2">{q.label}</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRatings((prev) => ({ ...prev, [q.id]: star }))}
                      className="cursor-pointer transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-8 h-8 ${
                          (ratings[q.id] || 0) >= star
                            ? 'text-amber-500 fill-amber-500'
                            : 'text-[var(--border-default)]'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <label className="block text-[15px] font-medium text-[var(--text-primary)] mb-2">
                Kommentar (optional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-[var(--border-default)] rounded-[var(--radius-md)] text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] bg-white shadow-[var(--shadow-xs)] outline-none resize-none"
                placeholder="Was können wir besser machen?"
              />
            </div>

            <Button onClick={submitSurvey} disabled={submitting} className="w-full" glow>
              <Send className="w-4 h-4" />
              {submitting ? 'Wird gesendet...' : 'Feedback senden'}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
