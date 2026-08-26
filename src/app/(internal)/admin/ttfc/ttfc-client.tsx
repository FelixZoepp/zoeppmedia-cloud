'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import {
  Timer,
  Clock,
  Phone,
  Users,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgencyTtfc {
  agency_id: string;
  agency_name: string;
  total: number;
  dialed: number;
  contacted: number;
  avg_time_to_first_dial_seconds: number | null;
  avg_ttfc_seconds: number | null;
  median_ttfc_seconds: number | null;
  p90_ttfc_seconds: number | null;
  under_15min: number;
  under_4h: number;
  over_4h: number;
}

interface OverallTtfc {
  total: number;
  contacted: number;
  avg_ttfc_seconds: number;
  median_ttfc_seconds: number;
  p90_ttfc_seconds: number;
  under_15min: number;
  under_4h: number;
  over_4h: number;
}

interface TtfcData {
  overall: OverallTtfc;
  by_agency: AgencyTtfc[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '\u2013';
  if (seconds < 60) return `${Math.round(seconds)} Sek`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} Min`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins > 0 ? `${hours} Std ${mins} Min` : `${hours} Std`;
}

function ttfcColor(seconds: number | null): string {
  if (!seconds || seconds <= 0) return 'text-gray-400';
  if (seconds < 900) return 'text-green-600';   // < 15 min
  if (seconds < 14400) return 'text-amber-600';  // < 4 h
  return 'text-red-600';                          // > 4 h
}

function ttfcBg(seconds: number | null): string {
  if (!seconds || seconds <= 0) return 'bg-gray-100';
  if (seconds < 900) return 'bg-green-50';
  if (seconds < 14400) return 'bg-amber-50';
  return 'bg-red-50';
}

function ttfcIconColor(seconds: number | null): string {
  if (!seconds || seconds <= 0) return 'text-gray-600';
  if (seconds < 900) return 'text-green-600';
  if (seconds < 14400) return 'text-amber-600';
  return 'text-red-600';
}

const DONUT_COLORS = ['#16a34a', '#d97706', '#dc2626']; // green, amber, red

/* ------------------------------------------------------------------ */
/*  KPI Card                                                          */
/* ------------------------------------------------------------------ */

function KpiCard({ label, value, sub, icon, iconBg = 'bg-gray-100', iconColor = 'text-gray-600', valueColor = 'text-gray-900' }: {
  label: string;
  value: string;
  sub?: string;
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
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Custom Tooltip                                                     */
/* ------------------------------------------------------------------ */

interface TooltipPayloadEntry {
  name: string;
  value: number;
  payload: { name: string; value: number; pct: string };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadEntry[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-lg text-sm">
      <p className="font-medium text-gray-900">{entry.payload.name}</p>
      <p className="text-gray-500">{entry.value} ({entry.payload.pct})</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function TtfcClient() {
  const [data, setData] = useState<TtfcData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/ttfc')
      .then((r) => {
        if (!r.ok) throw new Error(`Fehler ${r.status}`);
        return r.json();
      })
      .then((d: TtfcData) => setData(d))
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
        <PageHeader label="SPEED-TO-LEAD" title="TTFC Dashboard" />
        <Card padding="md">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { overall, by_agency } = data;

  const contactedPct = overall.total > 0
    ? `${Math.round((overall.contacted / overall.total) * 100)}%`
    : '0%';

  // Donut data
  const totalDistribution = overall.under_15min + overall.under_4h + overall.over_4h;
  const donutData = [
    {
      name: '< 15 Min',
      value: overall.under_15min,
      pct: totalDistribution > 0 ? `${Math.round((overall.under_15min / totalDistribution) * 100)}%` : '0%',
    },
    {
      name: '15 Min \u2013 4 Std',
      value: overall.under_4h,
      pct: totalDistribution > 0 ? `${Math.round((overall.under_4h / totalDistribution) * 100)}%` : '0%',
    },
    {
      name: '> 4 Std',
      value: overall.over_4h,
      pct: totalDistribution > 0 ? `${Math.round((overall.over_4h / totalDistribution) * 100)}%` : '0%',
    },
  ];

  // Sort agencies by median ascending
  const sortedAgencies = [...by_agency].sort((a, b) => {
    const aVal = a.median_ttfc_seconds ?? Infinity;
    const bVal = b.median_ttfc_seconds ?? Infinity;
    return aVal - bVal;
  });

  return (
    <div className="max-w-6xl">
      <PageHeader
        label="SPEED-TO-LEAD"
        title="Time to First Contact"
        description="Letzte 90 Tage"
      />

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label="Median TTFC"
          value={formatDuration(overall.median_ttfc_seconds)}
          icon={<Timer className="w-5 h-5" />}
          iconBg={ttfcBg(overall.median_ttfc_seconds)}
          iconColor={ttfcIconColor(overall.median_ttfc_seconds)}
          valueColor={ttfcColor(overall.median_ttfc_seconds)}
        />
        <KpiCard
          label="P90 TTFC"
          value={formatDuration(overall.p90_ttfc_seconds)}
          icon={<Clock className="w-5 h-5" />}
          iconBg={ttfcBg(overall.p90_ttfc_seconds)}
          iconColor={ttfcIconColor(overall.p90_ttfc_seconds)}
          valueColor={ttfcColor(overall.p90_ttfc_seconds)}
        />
        <KpiCard
          label="Avg Time to First Dial"
          value={formatDuration(overall.avg_ttfc_seconds)}
          icon={<Phone className="w-5 h-5" />}
          iconBg={ttfcBg(overall.avg_ttfc_seconds)}
          iconColor={ttfcIconColor(overall.avg_ttfc_seconds)}
          valueColor={ttfcColor(overall.avg_ttfc_seconds)}
        />
        <KpiCard
          label="Kontaktiert"
          value={`${overall.contacted} / ${overall.total}`}
          sub={contactedPct}
          icon={<Users className="w-5 h-5" />}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
      </div>

      {/* ─── Donut Chart ─── */}
      <Card padding="md" className="mb-8">
        <h2 className="text-sm font-semibold text-gray-900 mb-5">TTFC Verteilung</h2>
        {totalDistribution === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">Keine Daten vorhanden</p>
        ) : (
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-64 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {donutData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={DONUT_COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {donutData.map((entry, i) => (
                <div key={entry.name} className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: DONUT_COLORS[i] }}
                  />
                  <span className="text-sm text-gray-700 min-w-[120px]">{entry.name}</span>
                  <span className="text-sm font-bold text-gray-900 tabular-nums">{entry.value}</span>
                  <span className="text-xs text-gray-500 tabular-nums">({entry.pct})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ─── Agency Breakdown Table ─── */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Agentur-Breakdown</h2>
        </div>
        {sortedAgencies.length === 0 ? (
          <p className="text-sm text-gray-400 px-6 py-8">Keine Agenturen gefunden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Agentur</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Median TTFC</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">P90 TTFC</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Kontaktiert</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">&lt; 15 Min</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">&lt; 4 Std</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">&gt; 4 Std</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedAgencies.map((agency) => {
                  const contactPct = agency.total > 0
                    ? Math.round((agency.contacted / agency.total) * 100)
                    : 0;

                  return (
                    <tr key={agency.agency_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-[200px] truncate">
                        {agency.agency_name}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium text-right tabular-nums ${ttfcColor(agency.median_ttfc_seconds)}`}>
                        {formatDuration(agency.median_ttfc_seconds)}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium text-right tabular-nums ${ttfcColor(agency.p90_ttfc_seconds)}`}>
                        {formatDuration(agency.p90_ttfc_seconds)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                        {agency.contacted} / {agency.total}
                        <span className="text-xs text-gray-400 ml-1">({contactPct}%)</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-green-600 font-medium text-right tabular-nums">
                        {agency.under_15min}
                      </td>
                      <td className="px-4 py-3 text-sm text-amber-600 font-medium text-right tabular-nums">
                        {agency.under_4h}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-600 font-medium text-right tabular-nums">
                        {agency.over_4h}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
