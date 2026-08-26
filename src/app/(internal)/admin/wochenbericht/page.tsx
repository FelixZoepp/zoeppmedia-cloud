'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';

// ── Types ───────────────────────────────────────────────────────────────────

interface WeekRow {
  week_start: string;
  week_label: string;
  kw: number;
  spend: number;
  leads: number;
  setting_gebucht: number;
  setting_no_show: number;
  setting_stattgefunden: number;
  closing_gebucht: number;
  closing_no_show: number;
  closing_stattgefunden: number;
  won: number;
  won_revenue: number;
  lost: number;
  cpl: number;
  roas: number;
  setting_show_rate: number;
  closing_show_rate: number;
}

interface MonthRow {
  month: string;
  label: string;
  spend: number;
  leads: number;
  setting_gebucht: number;
  setting_no_show: number;
  setting_show_rate: number;
  closing_gebucht: number;
  closing_no_show: number;
  closing_show_rate: number;
  won: number;
  won_revenue: number;
  lost: number;
  cpl: number;
  roas: number;
  profit: number;
}

interface ReportData {
  weeks: WeekRow[];
  months: MonthRow[];
}

// ── Formatters ──────────────────────────────────────────────────────────────

function fmtEur(v: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

function fmtEur2(v: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function rateColor(rate: number): string {
  if (rate >= 80) return 'text-green-600';
  if (rate >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function roasColor(roas: number): string {
  if (roas >= 5) return 'text-green-600';
  if (roas >= 2) return 'text-amber-600';
  return 'text-red-600';
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function WochenberichtPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'wochen' | 'monate'>('wochen');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch('/api/admin/wochenbericht?weeks=12')
      .then((r) => {
        if (!r.ok) throw new Error(`Fehler ${r.status}`);
        return r.json();
      })
      .then((d: ReportData) => setData(d))
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
      <div className="max-w-7xl">
        <PageHeader label="REPORT" title="Wochenbericht" />
        <Card padding="md"><p className="text-sm text-red-600">{error}</p></Card>
      </div>
    );
  }

  if (!data) return null;

  // Totals for summary
  const totalSpend = data.weeks.reduce((s, w) => s + w.spend, 0);
  const totalLeads = data.weeks.reduce((s, w) => s + w.leads, 0);
  const totalWon = data.weeks.reduce((s, w) => s + w.won, 0);
  const totalRevenue = data.weeks.reduce((s, w) => s + w.won_revenue, 0);

  return (
    <div className="max-w-7xl">
      <PageHeader
        label="REPORT"
        title="Wochenbericht"
        description="Profitabilität pro Woche & Monat"
      />

      {/* ─── Summary Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card padding="md">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gesamt Spend</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{fmtEur2(totalSpend)}</p>
        </Card>
        <Card padding="md">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gesamt Leads</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{totalLeads}</p>
          <p className="text-xs text-gray-500 mt-1">CPL: {totalLeads > 0 ? fmtEur2(totalSpend / totalLeads) : '–'}</p>
        </Card>
        <Card padding="md">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gesamt Closes</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{totalWon}</p>
          <p className="text-xs text-gray-500 mt-1">{fmtEur(totalRevenue)} Umsatz</p>
        </Card>
        <Card padding="md">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gesamt ROAS</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${roasColor(totalSpend > 0 ? totalRevenue / totalSpend : 0)}`}>
            {totalSpend > 0 ? `${(totalRevenue / totalSpend).toFixed(1)}x` : '–'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Profit: {fmtEur(totalRevenue - totalSpend)}</p>
        </Card>
      </div>

      {/* ─── Toggle ─── */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView('wochen')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            view === 'wochen' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Wochenansicht
        </button>
        <button
          onClick={() => setView('monate')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            view === 'monate' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Monatsansicht
        </button>
      </div>

      {/* ─── Wochen-Tabelle ─── */}
      {view === 'wochen' && (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">KW</th>
                  <th className="px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Zeitraum</th>
                  <th className="px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap text-right">Spend</th>
                  <th className="px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap text-right">Leads</th>
                  <th className="px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap text-right">CPL</th>
                  <th className="px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap text-center" colSpan={3}>Setting</th>
                  <th className="px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap text-center" colSpan={3}>Closing</th>
                  <th className="px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap text-right">Won</th>
                  <th className="px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap text-right">Umsatz</th>
                  <th className="px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap text-right">ROAS</th>
                </tr>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th colSpan={5} />
                  <th className="px-2 py-1 text-[10px] text-gray-400 text-center">Gebucht</th>
                  <th className="px-2 py-1 text-[10px] text-gray-400 text-center">No-Show</th>
                  <th className="px-2 py-1 text-[10px] text-gray-400 text-center">Show%</th>
                  <th className="px-2 py-1 text-[10px] text-gray-400 text-center">Gebucht</th>
                  <th className="px-2 py-1 text-[10px] text-gray-400 text-center">No-Show</th>
                  <th className="px-2 py-1 text-[10px] text-gray-400 text-center">Show%</th>
                  <th colSpan={3} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.weeks.map((w) => {
                  const hasData = w.spend > 0 || w.leads > 0;
                  if (!hasData) return null;
                  return (
                    <tr key={w.week_start} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">KW {w.kw}</td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{w.week_label}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-medium text-gray-900">{w.spend > 0 ? fmtEur2(w.spend) : '–'}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-900">{w.leads || '–'}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-600">{w.cpl > 0 ? fmtEur2(w.cpl) : '–'}</td>
                      {/* Setting */}
                      <td className="px-2 py-3 text-center tabular-nums text-gray-900">{w.setting_gebucht || '–'}</td>
                      <td className="px-2 py-3 text-center tabular-nums">
                        {w.setting_no_show > 0 ? <span className="text-red-600">{w.setting_no_show}</span> : '–'}
                      </td>
                      <td className="px-2 py-3 text-center tabular-nums">
                        {w.setting_gebucht > 0 ? (
                          <span className={`font-medium ${rateColor(w.setting_show_rate)}`}>{w.setting_show_rate}%</span>
                        ) : '–'}
                      </td>
                      {/* Closing */}
                      <td className="px-2 py-3 text-center tabular-nums text-gray-900">{w.closing_gebucht || '–'}</td>
                      <td className="px-2 py-3 text-center tabular-nums">
                        {w.closing_no_show > 0 ? <span className="text-red-600">{w.closing_no_show}</span> : '–'}
                      </td>
                      <td className="px-2 py-3 text-center tabular-nums">
                        {w.closing_gebucht > 0 ? (
                          <span className={`font-medium ${rateColor(w.closing_show_rate)}`}>{w.closing_show_rate}%</span>
                        ) : '–'}
                      </td>
                      {/* Won */}
                      <td className="px-3 py-3 text-right tabular-nums">
                        {w.won > 0 ? <Badge tone="success">{w.won}</Badge> : '–'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-medium text-green-600">
                        {w.won_revenue > 0 ? fmtEur(w.won_revenue) : '–'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {w.roas > 0 ? (
                          <span className={`font-bold ${roasColor(w.roas)}`}>{w.roas.toFixed(1)}x</span>
                        ) : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ─── Monats-Tabelle ─── */}
      {view === 'monate' && (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Monat</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Spend</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Leads</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">CPL</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Settings</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Show%</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Closings</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Show%</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Won</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Umsatz</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Profit</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.months.map((m) => (
                  <tr key={m.month} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{m.label}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">{m.spend > 0 ? fmtEur2(m.spend) : '–'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">{m.leads || '–'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{m.cpl > 0 ? fmtEur2(m.cpl) : '–'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">{m.setting_gebucht || '–'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {m.setting_gebucht > 0 ? (
                        <span className={`font-medium ${rateColor(m.setting_show_rate)}`}>{m.setting_show_rate}%</span>
                      ) : '–'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">{m.closing_gebucht || '–'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {m.closing_gebucht > 0 ? (
                        <span className={`font-medium ${rateColor(m.closing_show_rate)}`}>{m.closing_show_rate}%</span>
                      ) : '–'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {m.won > 0 ? <Badge tone="success">{m.won}</Badge> : '–'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-green-600">
                      {m.won_revenue > 0 ? fmtEur(m.won_revenue) : '–'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={`font-medium ${m.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {m.spend > 0 || m.won_revenue > 0 ? fmtEur(m.profit) : '–'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {m.roas > 0 ? (
                        <span className={`font-bold ${roasColor(m.roas)}`}>{m.roas.toFixed(1)}x</span>
                      ) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
