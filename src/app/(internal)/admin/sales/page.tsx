'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Handshake, TrendingUp, Trophy, XCircle, Target } from 'lucide-react';

interface DealSummary {
  total_deals: number;
  total_value: number;
  won_value: number;
  open_value: number;
  lost_value: number;
  win_rate: number;
}

interface PipelineStatus {
  id: string;
  label: string;
  type: string;
  count: number;
  total_value: number;
}

interface Deal {
  id: string;
  lead_name: string;
  status_label: string;
  status_type: string;
  value: number;
  confidence: number;
  note: string;
  date_created: string;
  date_updated: string;
}

interface SalesData {
  summary: DealSummary;
  statuses: PipelineStatus[];
  deals: Deal[];
}

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

function statusBadgeTone(type: string): 'success' | 'accent' | 'neutral' {
  if (type === 'won') return 'success';
  if (type === 'lost') return 'neutral';
  return 'accent';
}

function statusColor(type: string): string {
  if (type === 'won') return 'bg-green-500';
  if (type === 'lost') return 'bg-red-500';
  return 'bg-blue-500';
}

const STATUS_COLORS = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-sky-500',
  'bg-cyan-500',
  'bg-teal-500',
  'bg-emerald-500',
];

export default function AdminSalesPage() {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/sales')
      .then((r) => {
        if (!r.ok) throw new Error(`Fehler ${r.status}`);
        return r.json();
      })
      .then((d: SalesData) => setData(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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
        <PageHeader label="SALES" title="D2D Sales Pipeline" />
        <Card padding="md">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { summary, statuses, deals } = data;
  const totalDealsForBar = statuses.reduce((sum, s) => sum + s.count, 0) || 1;

  // Assign colors: won=green, lost=red, active statuses get rotating blues
  let activeColorIdx = 0;
  const statusColorMap: Record<string, string> = {};
  for (const s of statuses) {
    if (s.type === 'won') statusColorMap[s.id] = 'bg-green-500';
    else if (s.type === 'lost') statusColorMap[s.id] = 'bg-red-500';
    else {
      statusColorMap[s.id] = STATUS_COLORS[activeColorIdx % STATUS_COLORS.length];
      activeColorIdx++;
    }
  }

  const winRateTone =
    summary.win_rate >= 50 ? 'success' : summary.win_rate < 30 ? 'accent' : 'neutral';

  return (
    <div className="max-w-6xl">
      <PageHeader
        label="SALES"
        title="D2D Sales Pipeline"
        counter={`${summary.total_deals} Deals`}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <Card padding="sm">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-gray-100 rounded-lg shrink-0">
              <Handshake className="w-4 h-4 text-gray-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Deals gesamt</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{summary.total_deals}</p>
            </div>
          </div>
        </Card>

        <Card padding="sm">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-50 rounded-lg shrink-0">
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Pipeline-Wert</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5 leading-tight">
                {formatEur(summary.open_value)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">offen</p>
            </div>
          </div>
        </Card>

        <Card padding="sm">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-green-50 rounded-lg shrink-0">
              <Trophy className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Gewonnen</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5 leading-tight">
                {formatEur(summary.won_value)}
              </p>
              <Badge tone="success" className="mt-1">Won</Badge>
            </div>
          </div>
        </Card>

        <Card padding="sm">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-50 rounded-lg shrink-0">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Verloren</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5 leading-tight">
                {formatEur(summary.lost_value)}
              </p>
            </div>
          </div>
        </Card>

        <Card padding="sm">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-50 rounded-lg shrink-0">
              <Target className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Win Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">
                {summary.win_rate.toFixed(1)}%
              </p>
              <Badge tone={winRateTone} className="mt-1">
                {summary.win_rate >= 50 ? 'Gut' : summary.win_rate < 30 ? 'Niedrig' : 'Mittel'}
              </Badge>
            </div>
          </div>
        </Card>
      </div>

      {/* Pipeline Visualisation */}
      <Card padding="md" className="mb-8">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Pipeline nach Status</h2>

        {/* Segmented bar */}
        {statuses.length > 0 && (
          <div className="flex h-4 rounded-full overflow-hidden gap-px mb-5">
            {statuses
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.id}
                  className={`${statusColorMap[s.id]} transition-all`}
                  style={{ width: `${(s.count / totalDealsForBar) * 100}%` }}
                  title={`${s.label}: ${s.count} Deals`}
                />
              ))}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {statuses
            .filter((s) => s.count > 0)
            .map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-sm ${statusColorMap[s.id]}`} />
                <div>
                  <span className="text-xs font-medium text-gray-700">{s.label}</span>
                  <span className="text-xs text-gray-400 ml-1.5">
                    {s.count} · {formatEur(s.total_value)}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </Card>

      {/* Deals Table */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Alle Deals</h2>
        </div>

        <div className="divide-y divide-gray-100">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_160px_100px_80px_100px_100px] gap-4 px-6 py-3 bg-gray-50">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Unternehmen</span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Status</span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Wert (€)</span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Conf. %</span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Erstellt</span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Aktualisiert</span>
          </div>

          {deals.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-gray-400">Keine Deals gefunden</p>
            </div>
          )}

          {deals.map((deal) => (
            <div
              key={deal.id}
              className="grid grid-cols-[1fr_160px_100px_80px_100px_100px] gap-4 items-center px-6 py-3.5 hover:bg-gray-50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-gray-900 truncate">{deal.lead_name}</p>
                {deal.note && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{deal.note}</p>
                )}
              </div>

              <div>
                <Badge tone={statusBadgeTone(deal.status_type)}>
                  {deal.status_label}
                </Badge>
              </div>

              <div className="text-right">
                <span className="text-sm font-medium text-gray-900">
                  {deal.value > 0 ? formatEur(deal.value) : '—'}
                </span>
              </div>

              <div className="text-right">
                <span className="text-sm text-gray-600">
                  {deal.confidence > 0 ? `${deal.confidence}%` : '—'}
                </span>
              </div>

              <span className="text-xs text-gray-500">{formatDate(deal.date_created)}</span>
              <span className="text-xs text-gray-500">{formatDate(deal.date_updated)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
