'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import {
  TrendingUp,
  DollarSign,
  Users,
  Target,
  Trophy,
  UserPlus,
  RefreshCw,
  ArrowDown,
  XCircle,
} from 'lucide-react';

const RANGE_OPTIONS = [
  { value: '30d', label: '30 Tage' },
  { value: '7d', label: '7 Tage' },
  { value: 'all', label: 'Gesamt' },
];

// ── Types ───────────────────────────────────────────────────────────────────

interface Funnel {
  leads: number;
  setting_plus: number;
  closing_plus: number;
  won: number;
  lost: number;
  verloren: number;
  stuck_in_setting: number;
  stuck_in_closing: number;
  setting_rate: number;
  closing_rate: number;
  win_rate: number;
  closing_to_won_rate: number;
  setting_to_closing_rate: number;
  drop_rate: number;
  setting_terminiert: number;
  setting_no_show: number;
  setting_follow_up: number;
  setting_show_rate: number;
  closing_terminiert: number;
  closing_no_show: number;
  closing_follow_up: number;
  closing_show_rate: number;
  status_breakdown: Record<string, number>;
}

interface Costs {
  per_lead: number;
  per_setting: number;
  per_closing: number;
  per_kunde: number;
  roas_neukunde: number;
  roas_total: number;
}

interface Revenue {
  neukunde: { count: number; value: number };
  bestandskunde: { count: number; value: number };
  total: number;
}

interface CampaignRow {
  id: string;
  name: string;
  spend: number;
  leads: number;
  impressions: number;
  clicks: number;
}

interface AdRow {
  name: string;
  adset: string;
  spend: number;
  leads: number;
  impressions: number;
  clicks: number;
}

interface MetaData {
  total: { spend: number; leads: number; impressions: number; clicks: number };
  campaigns: CampaignRow[];
  ads: AdRow[];
}

interface Deal {
  id: string;
  lead_name: string;
  status_label: string;
  status_type: string;
  value: number;
  deal_type: 'neukunde' | 'bestandskunde';
  funnel_stage: string;
}

interface ReportData {
  period: { since: string; until: string };
  meta: MetaData;
  funnel: Funnel;
  costs: Costs;
  revenue: Revenue;
  deals: Deal[];
}

// ── Formatters ──────────────────────────────────────────────────────────────

function fmtEur(v: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

function fmtEur2(v: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function fmtNum(v: number): string {
  return new Intl.NumberFormat('de-DE').format(v);
}

// ── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, iconBg = 'bg-gray-100', iconColor = 'text-gray-600' }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; iconBg?: string; iconColor?: string;
}) {
  return (
    <Card padding="md" className="flex items-start gap-4">
      <div className={`flex-shrink-0 w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center ${iconColor}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </div>
    </Card>
  );
}

// ── Funnel Step ─────────────────────────────────────────────────────────────

function FunnelStep({ label, count, total, cost, dropLabel, dropCount, color }: {
  label: string; count: number; total: number; cost: number; dropLabel?: string; dropCount?: number; color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{label}</span>
          <Badge tone="neutral">{count}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-900 tabular-nums">{pct.toFixed(1)}%</span>
          {cost > 0 && (
            <span className="text-xs text-gray-500 tabular-nums">{fmtEur2(cost)} / Stk</span>
          )}
        </div>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-4 mb-1">
        <div
          className={`h-4 rounded-full transition-all ${color}`}
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
      </div>
      {dropLabel && dropCount !== undefined && dropCount > 0 && (
        <div className="flex items-center gap-1.5 mt-1 ml-2">
          <ArrowDown className="w-3 h-3 text-red-400" />
          <span className="text-xs text-red-500">{dropLabel}: {dropCount}</span>
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function AdminReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState('30d');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/admin/report?range=${range}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Fehler ${r.status}`);
        return r.json();
      })
      .then((d: ReportData) => setData(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [range]);

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
        <PageHeader label="REPORT" title="Funnel Report" />
        <Card padding="md"><p className="text-sm text-red-600">{error}</p></Card>
      </div>
    );
  }

  if (!data) return null;

  const { meta, funnel, costs, revenue } = data;

  return (
    <div className="max-w-6xl">
      <PageHeader
        label="REPORT"
        title="D2D Funnel Report"
        description={`${data.period.since} – ${data.period.until}`}
        counter={`${funnel.leads} Leads`}
      />

      {/* ─── Cost KPIs mit Tabs ─── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Kennzahlen</h2>
        <Select
          options={RANGE_OPTIONS}
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="w-36"
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card padding="md">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ad Spend</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{fmtEur2(meta.total.spend)}</p>
        </Card>
        <Card padding="md">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cost / Lead</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{costs.per_lead > 0 ? fmtEur2(costs.per_lead) : '–'}</p>
          <p className="text-xs text-gray-500 mt-1">{funnel.leads} Leads</p>
        </Card>
        <Card padding="md">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cost / Kunde</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{costs.per_kunde > 0 ? fmtEur2(costs.per_kunde) : '–'}</p>
          <p className="text-xs text-gray-500 mt-1">{funnel.won} Won</p>
        </Card>
        <Card padding="md">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">ROAS</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${costs.roas_total >= 5 ? 'text-green-600' : 'text-red-600'}`}>
            {costs.roas_total > 0 ? `${costs.roas_total.toFixed(1)}x` : '–'}
          </p>
          {costs.roas_neukunde > 0 && <p className="text-xs text-gray-500 mt-1">Neukunde: {costs.roas_neukunde.toFixed(1)}x</p>}
        </Card>
      </div>

      {/* ─── Funnel ─── */}
      <Card padding="md" className="mb-8">
        <h2 className="text-sm font-semibold text-gray-900 mb-5">Funnel: Lead → Closing → Kunde</h2>
        <div className="space-y-5">
          <FunnelStep
            label="Leads (im CRM)"
            count={funnel.leads}
            total={funnel.leads}
            cost={costs.per_lead}
            color="bg-blue-500"
          />
          <FunnelStep
            label="Closing"
            count={funnel.closing_plus}
            total={funnel.leads}
            cost={costs.per_closing}
            dropLabel="Im Setting hängen / No-Show / Lost"
            dropCount={funnel.stuck_in_setting + funnel.verloren}
            color="bg-purple-500"
          />
          <FunnelStep
            label="Won / Kunde"
            count={funnel.won}
            total={funnel.leads}
            cost={costs.per_kunde}
            dropLabel="Im Closing hängen"
            dropCount={funnel.stuck_in_closing}
            color="bg-green-500"
          />
        </div>

        {/* Drop-off summary */}
        <div className="flex flex-wrap gap-4 mt-6 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-gray-600">
              Verloren: <strong>{funnel.verloren}</strong> ({funnel.drop_rate}%)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-green-500" />
            <span className="text-sm text-gray-600">
              Closing → Won: <strong>{funnel.closing_to_won_rate}%</strong>
            </span>
          </div>
        </div>
      </Card>

      {/* ─── Show-Raten ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card padding="md">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Setting-Termine</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Terminiert</span>
              <span className="font-medium text-gray-900">{funnel.setting_terminiert}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-red-500">No-Show</span>
              <span className="font-medium text-red-600">{funnel.setting_no_show}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Follow-Up</span>
              <span className="font-medium text-gray-900">{funnel.setting_follow_up}</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
              <span className="font-semibold text-gray-900">Show-Rate</span>
              <span className={`font-bold ${funnel.setting_show_rate >= 70 ? 'text-green-600' : 'text-red-600'}`}>
                {funnel.setting_show_rate}%
              </span>
            </div>
          </div>
        </Card>

        <Card padding="md">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Closing-Termine</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Terminiert</span>
              <span className="font-medium text-gray-900">{funnel.closing_terminiert}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-red-500">No-Show</span>
              <span className="font-medium text-red-600">{funnel.closing_no_show}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Follow-Up</span>
              <span className="font-medium text-gray-900">{funnel.closing_follow_up}</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
              <span className="font-semibold text-gray-900">Show-Rate</span>
              <span className={`font-bold ${funnel.closing_show_rate >= 70 ? 'text-green-600' : 'text-red-600'}`}>
                {funnel.closing_show_rate}%
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* ─── Revenue Split ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card padding="md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 rounded-lg shrink-0">
              <UserPlus className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Neukunden-Umsatz</p>
              <p className="text-xs text-gray-500">{revenue.neukunde.count} Deals (Erstbuchung)</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-green-600">{fmtEur(revenue.neukunde.value)}</p>
        </Card>

        <Card padding="md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-50 rounded-lg shrink-0">
              <RefreshCw className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Bestandskunden-Umsatz</p>
              <p className="text-xs text-gray-500">{revenue.bestandskunde.count} Deals (Upsell)</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-purple-600">{fmtEur(revenue.bestandskunde.value)}</p>
        </Card>
      </div>

      {/* ─── Ad Creative Breakdown ─── */}
      <Card padding="none" className="overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Ad-Creative Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Creative</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Spend</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Leads</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">CPL</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Klicks</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Impressions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {meta.ads
                .filter((a) => a.spend > 1)
                .sort((a, b) => b.spend - a.spend)
                .map((ad) => (
                  <tr key={ad.name} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 truncate max-w-[250px]">{ad.name}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[250px]">{ad.adset}</p>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right tabular-nums">
                      {fmtEur2(ad.spend)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                      {ad.leads > 0 ? ad.leads : '–'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                      {ad.leads > 0 ? fmtEur2(ad.spend / ad.leads) : '–'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums">
                      {fmtNum(ad.clicks)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right tabular-nums">
                      {fmtNum(ad.impressions)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ─── Campaign Breakdown ─── */}
      <Card padding="none" className="overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Kampagnen-Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Kampagne</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Spend</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Leads</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">CPL</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Klicks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {meta.campaigns
                .sort((a, b) => b.spend - a.spend)
                .map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-[300px] truncate">
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right tabular-nums">
                      {fmtEur2(c.spend)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                      {c.leads > 0 ? c.leads : '–'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                      {c.leads > 0 ? fmtEur2(c.spend / c.leads) : '–'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums">
                      {fmtNum(c.clicks)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ─── Deals Table ─── */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Alle Deals</h2>
        </div>
        <div className="divide-y divide-gray-100">
          <div className="grid grid-cols-[1fr_120px_100px_100px_100px] gap-4 px-6 py-3 bg-gray-50">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Unternehmen</span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Status</span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Stufe</span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Typ</span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Wert</span>
          </div>
          {data.deals
            .sort((a, b) => {
              const order = { won: 0, closing: 1, setting: 2, lost: 3, unqualifiziert: 4 };
              return (order[a.funnel_stage as keyof typeof order] ?? 5) - (order[b.funnel_stage as keyof typeof order] ?? 5);
            })
            .map((deal) => (
              <div
                key={deal.id}
                className="grid grid-cols-[1fr_120px_100px_100px_100px] gap-4 items-center px-6 py-3 hover:bg-gray-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900 truncate">{deal.lead_name}</p>
                <Badge tone={deal.status_type === 'won' ? 'success' : deal.status_type === 'lost' ? 'neutral' : 'accent'}>
                  {deal.status_label}
                </Badge>
                <Badge tone={
                  deal.funnel_stage === 'won' ? 'success' :
                  deal.funnel_stage === 'closing' ? 'accent' :
                  deal.funnel_stage === 'lost' ? 'neutral' :
                  'softAccent'
                }>
                  {deal.funnel_stage === 'won' ? 'Kunde' :
                   deal.funnel_stage === 'closing' ? 'Closing' :
                   deal.funnel_stage === 'setting' ? 'Setting' :
                   'Lost'}
                </Badge>
                <Badge tone={deal.deal_type === 'neukunde' ? 'accent' : 'success'}>
                  {deal.deal_type === 'neukunde' ? 'Neukunde' : 'Upsell'}
                </Badge>
                <span className="text-sm font-medium text-gray-900 text-right tabular-nums">
                  {deal.value > 0 ? fmtEur(deal.value) : '–'}
                </span>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
