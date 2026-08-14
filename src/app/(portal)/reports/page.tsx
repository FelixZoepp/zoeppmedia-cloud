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
  Calendar, Star, Send, Phone, Target, Clock, Euro,
  MousePointer, Eye, Megaphone, Download,
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

interface SurveyQuestion {
  id: string;
  type: 'rating' | 'choice' | 'text' | 'nps';
  label: string;
  options?: string[];
}

interface SurveyTemplate {
  id: string;
  title: string;
  description: string | null;
  questions: SurveyQuestion[];
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
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
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
    const numericValues = Object.values(answers).filter((v): v is number => typeof v === 'number');
    const avgRating = numericValues.length > 0
      ? Math.round(numericValues.reduce((a, b) => a + b, 0) / numericValues.length)
      : null;

    await fetch('/api/surveys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: templates[0].id,
        rating: avgRating,
        answers,
        comment,
      }),
    });

    setSurveySubmitted(true);
    setSubmitting(false);
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
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
          <div className="flex items-center gap-2">
            <a
              href={`/api/export/reports?period=${period}`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              CSV
            </a>
            <Button variant="soft" onClick={() => setShowSurvey(true)}>
              <Star className="w-4 h-4" /> Feedback geben
            </Button>
          </div>
        }
      />

      {/* Period filter */}
      <div className="mb-6">
        <SegmentedControl
          items={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
        />
      </div>

      {/* Pipeline KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Bewerber gesamt', value: data.total, icon: Users, color: 'bg-red-50 text-red-600' },
          { label: 'Letzte 30 Tage', value: data.last30, icon: Calendar, color: 'bg-red-50 text-red-600' },
          { label: 'Eingestellt', value: data.hired, icon: UserCheck, color: 'bg-green-100 text-green-700' },
          { label: 'Einstellungsrate', value: `${data.hireRate}%`, icon: Percent, color: 'bg-amber-100 text-amber-500' },
        ].map((kpi) => (
          <Card key={kpi.label} padding="md">
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${kpi.color}`}>
                <kpi.icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-gray-600">{kpi.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
          </Card>
        ))}
      </div>

      {/* KPI Soll/Ist Section */}
      {kpis.length > 0 && (
        <div className="space-y-5 mb-6">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-red-600" /> Ziel-Erreichung
          </h2>
          <Card padding="md">
            <div className="space-y-4">
              {kpis.map((kpi) => {
                const ratio = kpi.defaultValue > 0 ? kpi.value / kpi.defaultValue : 0;
                const isGood =
                  kpi.direction === 'higher_is_better' ? ratio >= 1 : ratio <= 1;
                const barWidth = Math.min(ratio * 100, 100);
                return (
                  <div key={kpi.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-900">{kpi.label}</span>
                      <span className="text-xs text-gray-400">
                        <span className="font-semibold text-gray-900">{kpi.value}{kpi.unit}</span>
                        {' / '}
                        <span>Ziel {kpi.defaultValue}{kpi.unit}</span>
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
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
      <div className="space-y-5 mb-6">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Phone className="w-5 h-5 text-red-600" /> Call-Performance
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card padding="md">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-50 text-red-600">
                <Phone className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-gray-600">Anrufe gesamt</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{data.callKpis.totalCalls}</p>
          </Card>
          <Card padding="md">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-green-100 text-green-700">
                <Target className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-gray-600">Erreichbarkeit</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{data.callKpis.reachRate}%</p>
          </Card>
          <Card padding="md">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-100 text-amber-500">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-gray-600">Termin-Quote</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{data.callKpis.terminRate}%</p>
          </Card>
          <Card padding="md">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-50 text-red-600">
                <Clock className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-gray-600">Ø Reaktionszeit</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {data.callKpis.avgResponseHours !== null ? `${data.callKpis.avgResponseHours}h` : '–'}
            </p>
          </Card>
        </div>
      </div>

      {/* Meta Ads Section — only when data exists */}
      {data.metaKpis && (
        <div className="space-y-5 mb-6">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-red-600" /> Meta Ads
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card padding="md">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-50 text-red-600">
                  <Euro className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-gray-600">Ausgaben</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                €{data.metaKpis.totalSpend.toFixed(2)}
              </p>
            </Card>
            <Card padding="md">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-green-100 text-green-700">
                  <Users className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-gray-600">Leads</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{data.metaKpis.totalLeads}</p>
            </Card>
            <Card padding="md">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-100 text-amber-500">
                  <Target className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-gray-600">Ø CPL</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                €{data.metaKpis.avgCpl.toFixed(2)}
              </p>
            </Card>
            <Card padding="md">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-50 text-red-600">
                  <Eye className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-gray-600">Impressions</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {data.metaKpis.totalImpressions.toLocaleString('de-DE')}
              </p>
            </Card>
            <Card padding="md">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-green-100 text-green-700">
                  <MousePointer className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-gray-600">Klicks</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {data.metaKpis.totalClicks.toLocaleString('de-DE')}
              </p>
            </Card>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Conversion Funnel */}
        <Card padding="md">
          <h2 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-red-600" /> Conversion Funnel
          </h2>
          <div className="space-y-4">
            {data.funnel.map((stage) => (
              <div key={stage.id} className="flex items-center gap-3">
                <span className="text-xs font-medium text-gray-600 w-36 truncate">{stage.name}</span>
                <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden">
                  <div
                    className="h-full rounded-lg transition-all flex items-center px-3"
                    style={{
                      width: `${Math.max((stage.count / maxFunnel) * 100, 8)}%`,
                      backgroundColor: stage.color,
                    }}
                  >
                    <span className="text-xs font-semibold text-white">{stage.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Source Breakdown */}
        <Card padding="md">
          <h2 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-red-600" /> Quellen
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Meta', value: data.sources.meta, color: 'bg-red-50 text-red-700' },
              { label: 'Indeed', value: data.sources.indeed, color: 'bg-green-100 text-green-700' },
              { label: 'Manuell', value: data.sources.manual, color: 'bg-gray-100 text-gray-600' },
            ].map((source) => (
              <div key={source.label} className="text-center">
                <div className={`w-16 h-16 rounded-xl ${source.color} flex items-center justify-center mx-auto mb-2`}>
                  <span className="text-xl font-bold">{source.value}</span>
                </div>
                <p className="text-xs font-medium text-gray-600">{source.label}</p>
                {totalSources > 0 && (
                  <p className="text-xs text-gray-400">
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
            <h3 className="text-lg font-bold text-gray-900 mb-2">Danke für dein Feedback!</h3>
            <p className="text-gray-600">Wir nutzen es, um noch besser zu werden.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {templates[0]?.questions.map((q) => (
              <div key={q.id}>
                <label className="block text-sm font-medium text-gray-900 mb-2">{q.label}</label>

                {/* rating: 1–5 stars */}
                {q.type === 'rating' && (
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: star }))}
                        className="cursor-pointer transition-transform hover:scale-110"
                      >
                        <Star
                          className={`w-8 h-8 ${
                            ((answers[q.id] as number) || 0) >= star
                              ? 'text-amber-500 fill-amber-500'
                              : 'text-gray-200'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* choice: pill buttons */}
                {q.type === 'choice' && q.options && (
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                        className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                          answers[q.id] === opt
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {/* text: textarea */}
                {q.type === 'text' && (
                  <textarea
                    value={(answers[q.id] as string) || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 bg-white outline-none resize-none focus:border-red-400 transition-colors"
                    placeholder="Deine Antwort..."
                  />
                )}

                {/* nps: 0–10 scale */}
                {q.type === 'nps' && (
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: 11 }, (_, i) => i).map((n) => {
                      const color =
                        n <= 6
                          ? 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200'
                          : n <= 8
                          ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200 border-green-200';
                      const selected = answers[q.id] === n;
                      return (
                        <button
                          key={n}
                          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: n }))}
                          className={`w-9 h-9 rounded-lg text-sm font-semibold border transition-colors ${color} ${
                            selected ? 'ring-2 ring-offset-1 ring-gray-400' : ''
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Kommentar (optional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 bg-white outline-none resize-none"
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
