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
  Calendar, Star, MessageSquare, Send
} from 'lucide-react';

interface FunnelStage {
  id: string;
  name: string;
  sort_order: number;
  color: string;
  count: number;
}

interface ReportData {
  total: number;
  last30: number;
  last7: number;
  hired: number;
  hireRate: number;
  funnel: FunnelStage[];
  sources: { meta: number; indeed: number; manual: number };
}

interface SurveyTemplate {
  id: string;
  title: string;
  description: string | null;
  questions: { id: string; type: string; label: string }[];
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [showSurvey, setShowSurvey] = useState(false);
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/reports').then((r) => r.json()),
      fetch('/api/surveys').then((r) => r.json()),
    ]).then(([reportData, surveyData]) => {
      setData(reportData);
      setTemplates(surveyData.templates);
      setLoading(false);
    });
  }, []);

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
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Gesamt Bewerber', value: data.total, icon: Users, color: 'bg-red-50 text-red-500' },
          { label: 'Letzte 30 Tage', value: data.last30, icon: Calendar, color: 'bg-red-50 text-red-500' },
          { label: 'Eingestellt', value: data.hired, icon: UserCheck, color: 'bg-green-100 text-green-700' },
          { label: 'Einstellungsrate', value: `${data.hireRate}%`, icon: Percent, color: 'bg-amber-100 text-amber-500' },
        ].map((kpi) => (
          <Card key={kpi.label} padding="md">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center ${kpi.color}`}>
                <kpi.icon className="w-5 h-5" />
              </div>
              <span className="text-[13px] font-medium text-[var(--text-secondary)]">{kpi.label}</span>
            </div>
            <p className="text-[28px] font-bold text-[var(--text-primary)]">{kpi.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <Card padding="md">
          <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-red-500" /> Conversion Funnel
          </h2>
          <div className="space-y-3">
            {data.funnel.map((stage) => (
              <div key={stage.id} className="flex items-center gap-3">
                <span className="text-[13px] font-medium text-[var(--text-secondary)] w-24 sm:w-36 flex-shrink-0 truncate">{stage.name}</span>
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
          <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-red-500" /> Quellen
          </h2>
          <div className="grid grid-cols-3 gap-6">
            {[
              { label: 'Meta', value: data.sources.meta, color: 'bg-red-50 text-red-600' },
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
