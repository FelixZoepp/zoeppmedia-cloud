'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import type { RecruitingStatsPayload, JobTableRow } from '@/lib/kpi/get-recruiting-stats';
import type { KpiTiles } from '@/lib/kpi/recruiting-kpis';

// ---------------------------------------------------------------------------
// Formatierungs-Helfer
// ---------------------------------------------------------------------------

function fmtPct(val: number | null): string {
  if (val === null || isNaN(val)) return '–';
  return (val * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + '\u00a0%';
}

function fmtNum(val: number): string {
  return val.toLocaleString('de-DE');
}

function deltaPct(curr: number | null, prev: number | null): string | null {
  if (curr === null || prev === null) return null;
  if (prev === 0) return null;
  const d = ((curr - prev) / Math.abs(prev)) * 100;
  return (d >= 0 ? '+' : '') + d.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + '\u00a0%';
}

function deltaAbs(curr: number, prev: number): string {
  const d = curr - prev;
  return (d >= 0 ? '+' : '') + fmtNum(d);
}

// ---------------------------------------------------------------------------
// KPI-Kachel
// ---------------------------------------------------------------------------

interface TileProps {
  label: string;
  value: string;
  delta: string | null;
  positive?: boolean; // true = grün wenn delta positiv, false = grün wenn negativ
}

function KpiTile({ label, value, delta, positive = true }: TileProps) {
  const isPositive = delta !== null && !delta.startsWith('-');
  const isGood = positive ? isPositive : !isPositive;
  const deltaColor = delta === null ? '' : isGood ? 'text-green-600' : 'text-red-600';

  return (
    <Card padding="sm">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {delta !== null && (
        <p className={`text-xs mt-1 font-medium ${deltaColor}`}>{delta} ggü. Vorperiode</p>
      )}
      {delta === null && <p className="text-xs mt-1 text-gray-300">–</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Quellen-Farben
// ---------------------------------------------------------------------------

const SOURCE_COLORS: Record<string, string> = {
  indeed: '#3B82F6',
  meta: '#6366F1',
  formular: '#10B981',
  manual: '#F59E0B',
  manuell: '#F59E0B',
};

function sourceColor(src: string): string {
  return SOURCE_COLORS[src.toLowerCase()] ?? '#8B919B';
}

// ---------------------------------------------------------------------------
// Haupt-Komponente
// ---------------------------------------------------------------------------

const ZEITRAUM_OPTIONS = [
  { value: '7', label: '7 Tage' },
  { value: '30', label: '30 Tage' },
  { value: '90', label: '90 Tage' },
];

const SOURCE_OPTIONS = [
  { value: '', label: 'Alle Quellen' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'meta', label: 'Meta' },
  { value: 'formular', label: 'Formular' },
  { value: 'manual', label: 'Manuell' },
];

export function RecruitingStatsView() {
  const [zeitraum, setZeitraum] = useState<'7' | '30' | '90'>('30');
  const [jobId, setJobId] = useState('');
  const [source, setSource] = useState('');
  const [data, setData] = useState<RecruitingStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const to = new Date().toISOString().slice(0, 10);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(zeitraum, 10));
    const from = fromDate.toISOString().slice(0, 10);

    const params = new URLSearchParams({ from, to });
    if (jobId) params.set('job_id', jobId);
    if (source) params.set('source', source);

    try {
      const res = await fetch(`/api/recruiting-stats?${params.toString()}`);
      if (res.ok) {
        const payload = await res.json() as RecruitingStatsPayload;
        setData(payload);
      }
    } finally {
      setLoading(false);
    }
  }, [zeitraum, jobId, source]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Job-Optionen aus jobsTable ableiten
  const jobOptions = [
    { value: '', label: 'Alle Jobs' },
    ...Array.from(
      new Map((data?.jobsTable ?? []).map((r: JobTableRow) => [r.jobId, r.title])).entries(),
    ).map(([id, title]) => ({ value: id, label: title })),
  ];

  // Zeitraum-Filter für Export-URL
  const exportTo = new Date().toISOString().slice(0, 10);
  const exportFrom = (() => {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(zeitraum, 10));
    return d.toISOString().slice(0, 10);
  })();
  const exportParams = new URLSearchParams({ from: exportFrom, to: exportTo });
  if (jobId) exportParams.set('job_id', jobId);
  if (source) exportParams.set('source', source);
  const exportUrl = `/api/recruiting-stats/export?${exportParams.toString()}`;

  const tiles = data?.kpis.tiles;
  const prev: KpiTiles | undefined = data?.previousTiles;

  // Timeline: alle Quellen-Keys sammeln
  const allSources = Array.from(
    new Set((data?.kpis.timeline ?? []).flatMap((d) => Object.keys(d.bySource))),
  );

  // Timeline flach für recharts
  const timelineFlat = (data?.kpis.timeline ?? []).map((row) => ({
    day: row.day,
    ...row.bySource,
  }));

  return (
    <div className="max-w-5xl">
      {/* Header + Filter */}
      <PageHeader
        label="RECRUITING"
        title="Statistiken"
        description="Kennzahlen nach Zeitraum, Job und Quelle"
        action={
          <div className="flex items-center gap-3">
            <Select
              value={zeitraum}
              onChange={(e) => setZeitraum(e.target.value as '7' | '30' | '90')}
              options={ZEITRAUM_OPTIONS}
              className="w-32"
            />
            <Select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              options={jobOptions}
              className="w-44"
            />
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              options={SOURCE_OPTIONS}
              className="w-40"
            />
          </div>
        }
      />

      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
        </div>
      )}

      {!loading && data && (
        <div className="space-y-8">
          {/* 1. KPI-Kacheln */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            <KpiTile
              label="Bewerbungen"
              value={fmtNum(tiles?.bewerbungen ?? 0)}
              delta={prev ? deltaAbs(tiles?.bewerbungen ?? 0, prev.bewerbungen) : null}
              positive
            />
            <KpiTile
              label="Antwortquote"
              value={fmtPct(tiles?.antwortquote ?? null)}
              delta={prev ? deltaPct(tiles?.antwortquote ?? null, prev.antwortquote) : null}
              positive
            />
            <KpiTile
              label="Vorquali abgeschlossen"
              value={fmtNum(tiles?.vorqualiAbgeschlossen ?? 0)}
              delta={prev ? deltaAbs(tiles?.vorqualiAbgeschlossen ?? 0, prev.vorqualiAbgeschlossen) : null}
              positive
            />
            <KpiTile
              label="Qualifiziert (A+B)"
              value={fmtNum(tiles?.qualifiziert ?? 0)}
              delta={prev ? deltaAbs(tiles?.qualifiziert ?? 0, prev.qualifiziert) : null}
              positive
            />
            <KpiTile
              label="Termine gebucht"
              value={fmtNum(tiles?.termineGebucht ?? 0)}
              delta={prev ? deltaAbs(tiles?.termineGebucht ?? 0, prev.termineGebucht) : null}
              positive
            />
            <KpiTile
              label="No-Show-Quote"
              value={fmtPct(tiles?.noShowQuote ?? null)}
              delta={prev ? deltaPct(tiles?.noShowQuote ?? null, prev.noShowQuote) : null}
              positive={false}
            />
            <KpiTile
              label="Einstellungen"
              value={fmtNum(tiles?.einstellungen ?? 0)}
              delta={prev ? deltaAbs(tiles?.einstellungen ?? 0, prev.einstellungen) : null}
              positive
            />
          </div>

          {/* 2. Trichter */}
          <Card padding="md">
            <h2 className="text-sm font-semibold text-gray-900 mb-5">Recruiting-Trichter</h2>
            <div className="space-y-3">
              {(data.kpis.funnel).map((step, idx) => {
                const maxCount = data.kpis.funnel[0]?.count ?? 1;
                const widthPct = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
                return (
                  <div key={step.key} className="flex items-center gap-4">
                    <span className="text-xs text-gray-500 w-44 shrink-0 truncate">{step.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-red-500 transition-all duration-500"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-10 text-right shrink-0">
                      {fmtNum(step.count)}
                    </span>
                    {idx > 0 && step.dropRate !== null ? (
                      <span className="text-xs text-red-500 w-16 text-right shrink-0">
                        -{fmtPct(step.dropRate)}
                      </span>
                    ) : (
                      <span className="w-16" />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 3. Quellenvergleich */}
          <Card padding="md">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Quellenvergleich</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                    <th className="text-left py-2 pr-4">Quelle</th>
                    <th className="text-right py-2 px-4">Bewerbungen</th>
                    <th className="text-right py-2 px-4">Qualifizierungsquote</th>
                    <th className="text-right py-2 pl-4">Terminquote</th>
                  </tr>
                </thead>
                <tbody>
                  {data.kpis.sources.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-gray-400 text-sm">
                        Keine Daten vorhanden
                      </td>
                    </tr>
                  )}
                  {data.kpis.sources.map((src) => (
                    <tr key={src.source} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: sourceColor(src.source) }}
                          />
                          <span className="font-medium text-gray-900 capitalize">{src.source}</span>
                        </div>
                      </td>
                      <td className="text-right py-2.5 px-4 text-gray-700">{fmtNum(src.count)}</td>
                      <td className="text-right py-2.5 px-4 text-gray-700">{fmtPct(src.qualifizierungsquote)}</td>
                      <td className="text-right py-2.5 pl-4 text-gray-700">{fmtPct(src.terminquote)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 4. Verlauf AreaChart */}
          <Card padding="md">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Bewerbungsverlauf</h2>
            {timelineFlat.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Keine Verlaufsdaten im gewählten Zeitraum</p>
            ) : (
              <div className="h-[220px] -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineFlat} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <defs>
                      {allSources.map((src) => (
                        <linearGradient key={src} id={`grad-${src}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={sourceColor(src)} stopOpacity={0.15} />
                          <stop offset="95%" stopColor={sourceColor(src)} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EFF1F4" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: '#8B919B' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#8B919B' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      width={28}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: '1px solid #E7E9ED',
                        borderRadius: '10px',
                        boxShadow: '0 4px 12px rgba(23,24,26,0.08)',
                        fontSize: '13px',
                        padding: '6px 10px',
                      }}
                      labelStyle={{ fontWeight: 600, marginBottom: 2 }}
                    />
                    {allSources.map((src) => (
                      <Area
                        key={src}
                        type="monotone"
                        dataKey={src}
                        name={src}
                        stackId="1"
                        stroke={sourceColor(src)}
                        strokeWidth={2}
                        fill={`url(#grad-${src})`}
                        dot={false}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            {allSources.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-4">
                {allSources.map((src) => (
                  <div key={src} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: sourceColor(src) }} />
                    <span className="text-xs text-gray-500 capitalize">{src}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 5. Bot-Leistung + Aufgaben nebeneinander */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bot */}
            <Card padding="md">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Bot-Leistung</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Abschlussquote</span>
                  <span className="font-semibold text-gray-900">{fmtPct(data.kpis.bot.abschlussquote)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Ø Nachrichten</span>
                  <span className="font-semibold text-gray-900">
                    {data.kpis.bot.avgNachrichten !== null
                      ? data.kpis.bot.avgNachrichten.toLocaleString('de-DE', { maximumFractionDigits: 1 })
                      : '–'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Übergabequote</span>
                  <span className="font-semibold text-gray-900">{fmtPct(data.kpis.bot.uebergabequote)}</span>
                </div>
              </div>
              {data.kpis.bot.topKnockouts.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Top Knockouts</p>
                  <ul className="space-y-1">
                    {data.kpis.bot.topKnockouts.map((ko) => (
                      <li key={ko.reason} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 truncate max-w-[200px]">{ko.reason}</span>
                        <Badge tone="neutral">{ko.count}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            {/* Aufgaben */}
            <Card padding="md">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Offene Aufgaben</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Braucht Mensch</p>
                    <p className="text-xs text-gray-400 mt-0.5">Übergabe an Mitarbeiter ausstehend</p>
                  </div>
                  <Badge tone={data.tasks.brauchtMensch > 0 ? 'softAccent' : 'neutral'}>
                    {data.tasks.brauchtMensch}
                  </Badge>
                </div>
                <div className="flex items-center justify-between border-t border-gray-50 pt-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Qualifiziert ohne Aktion</p>
                    <p className="text-xs text-gray-400 mt-0.5">Noch nicht zugewiesen</p>
                  </div>
                  <Badge tone={data.tasks.qualifiziertOhneAktion > 0 ? 'softAccent' : 'neutral'}>
                    {data.tasks.qualifiziertOhneAktion}
                  </Badge>
                </div>
                <div className="flex items-center justify-between border-t border-gray-50 pt-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Termine heute</p>
                    <p className="text-xs text-gray-400 mt-0.5">Bestätigte Termine für heute</p>
                  </div>
                  <Badge tone={data.tasks.termineHeute > 0 ? 'success' : 'neutral'}>
                    {data.tasks.termineHeute}
                  </Badge>
                </div>
              </div>
            </Card>
          </div>

          {/* 6. Jobs-Tabelle */}
          <Card padding="md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Jobs-Übersicht</h2>
              <a
                href={exportUrl}
                className="inline-flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
              >
                CSV exportieren
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                    <th className="text-left py-2 pr-4">Job</th>
                    <th className="text-left py-2 px-4">Status</th>
                    <th className="text-right py-2 px-4">Bewerbungen</th>
                    <th className="text-right py-2 px-4">Antwortquote</th>
                    <th className="text-right py-2 px-4">Qualifiziert</th>
                    <th className="text-right py-2 px-4">Termine</th>
                    <th className="text-right py-2 pl-4">Einstellungen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobsTable.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-gray-400">Keine Jobs im Zeitraum</td>
                    </tr>
                  )}
                  {data.jobsTable.map((row) => (
                    <tr key={row.jobId} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="py-2.5 pr-4 font-medium text-gray-900 max-w-[200px] truncate">{row.title}</td>
                      <td className="py-2.5 px-4">
                        <Badge tone={row.status === 'active' ? 'success' : 'neutral'}>
                          {row.status === 'active' ? 'Aktiv' : row.status}
                        </Badge>
                      </td>
                      <td className="text-right py-2.5 px-4 text-gray-700">{fmtNum(row.bewerbungen)}</td>
                      <td className="text-right py-2.5 px-4 text-gray-700">{fmtPct(row.antwortquote)}</td>
                      <td className="text-right py-2.5 px-4 text-gray-700">{fmtNum(row.qualifiziert)}</td>
                      <td className="text-right py-2.5 px-4 text-gray-700">{fmtNum(row.termine)}</td>
                      <td className="text-right py-2.5 pl-4 text-gray-700">{fmtNum(row.einstellungen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {!loading && !data && (
        <Card padding="md">
          <p className="text-sm text-gray-400 text-center py-8">Keine Daten verfügbar.</p>
        </Card>
      )}
    </div>
  );
}
