'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import {
  TrendingUp,
  DollarSign,
  Users,
  MousePointerClick,
  Eye,
  Target,
  Trophy,
  Percent,
  Clock,
  Filter,
  CheckCircle,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type Range = 'today' | '7d' | '30d' | 'all';

interface Insight {
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number;
  cpm: number;
  ctr: number;
  leads: number;
  cpl: number;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  insights: Insight | null;
}

interface AdSet {
  id: string;
  name: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  insights: Insight | null;
}

interface Summary {
  spend: number;
  pixel_leads: number;
  leads: number;
  cpl: number;
  cpc: number;
  ctr: number;
  impressions: number;
  clicks: number;
  setting_count: number;
  closing_count: number;
  won_count: number;
  lost_count: number;
  quali_rate: number;
  closing_rate: number;
  win_rate: number;
  revenue_won: number;
  revenue_open: number;
  deals_won: number;
  deals_open: number;
  total_revenue_won: number;
  total_deals_won: number;
  roas: number;
}

interface MarketingData {
  range: Range;
  period: { since: string; until: string };
  summary: Summary;
  campaigns: Campaign[];
  adsets: AdSet[];
}

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtEuro(value: number): string {
  if (value >= 1000) {
    return value.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCount(value: number): string {
  return value.toLocaleString('de-DE');
}

function fmtPct(value: number): string {
  return (
    value.toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + '%'
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
}

function KpiCard({ label, value, sub, icon, iconBg = 'bg-red-50', iconColor = 'text-red-600' }: KpiCardProps) {
  return (
    <Card padding="sm" className="overflow-hidden">
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center ${iconColor}`}>
          {icon}
        </div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">
          {label}
        </p>
      </div>
      <p className="text-xl font-bold text-gray-900 tabular-nums leading-tight truncate">
        {value}
      </p>
      {sub && <p className="text-xs text-gray-500 mt-1 truncate">{sub}</p>}
    </Card>
  );
}

// ── Insights Row Helper ───────────────────────────────────────────────────────

function InsightCells({ insights }: { insights: Insight | null }) {
  if (!insights) {
    return (
      <>
        <td className="px-4 py-3 text-sm text-gray-400">–</td>
        <td className="px-4 py-3 text-sm text-gray-400">–</td>
        <td className="px-4 py-3 text-sm text-gray-400">–</td>
        <td className="px-4 py-3 text-sm text-gray-400">–</td>
        <td className="px-4 py-3 text-sm text-gray-400">–</td>
        <td className="px-4 py-3 text-sm text-gray-400">–</td>
      </>
    );
  }
  return (
    <>
      <td className="px-4 py-3 text-sm font-medium text-gray-900 tabular-nums">
        € {fmtEuro(insights.spend)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 tabular-nums">
        {fmtCount(insights.leads)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 tabular-nums">
        {insights.cpl > 0 ? `€ ${fmtEuro(insights.cpl)}` : '–'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 tabular-nums">
        {insights.cpc > 0 ? `€ ${fmtEuro(insights.cpc)}` : '–'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 tabular-nums">
        {fmtPct(insights.ctr)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 tabular-nums">
        {fmtCount(insights.impressions)}
      </td>
    </>
  );
}

// ── Table Header ─────────────────────────────────────────────────────────────

function TableHeader({ withCampaign = false }: { withCampaign?: boolean }) {
  return (
    <thead>
      <tr className="bg-gray-50 border-b border-gray-200">
        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
          Name
        </th>
        {withCampaign && (
          <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
            Kampagne
          </th>
        )}
        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
          Status
        </th>
        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
          Ausgaben
        </th>
        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
          Leads
        </th>
        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
          CPL
        </th>
        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
          CPC
        </th>
        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
          CTR
        </th>
        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
          Impressions
        </th>
      </tr>
    </thead>
  );
}

function statusBadgeTone(status: string): 'success' | 'neutral' | 'softAccent' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'PAUSED') return 'neutral';
  return 'softAccent';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'Aktiv',
    PAUSED: 'Pausiert',
    ARCHIVED: 'Archiviert',
    DELETED: 'Gelöscht',
  };
  return map[status] ?? status;
}

// Funnel steps removed — use /admin/report for live funnel data

// ── Main Page ─────────────────────────────────────────────────────────────────

const RANGE_OPTIONS = [
  { value: 'today', label: 'Heute' },
  { value: '7d', label: '7 Tage' },
  { value: '30d', label: '30 Tage' },
  { value: 'all', label: 'Gesamt' },
];

export default function AdminMarketingPage() {
  const [range, setRange] = useState<Range>('30d');
  const [data, setData] = useState<MarketingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/marketing?range=${range}`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        const json: MarketingData = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const summary = data?.summary;

  return (
    <div className="max-w-7xl">
      <PageHeader
        label="MARKETING"
        title="Meta Ads Performance"
        description={
          data
            ? `${data.period.since} – ${data.period.until}`
            : undefined
        }
        action={
          <Select
            options={RANGE_OPTIONS}
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="w-36"
          />
        }
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <Card padding="md" className="border-red-200 bg-red-50">
          <p className="text-sm text-red-700 font-medium">
            Fehler beim Laden der Meta-Daten: {error}
          </p>
        </Card>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <div className="space-y-8">

          {/* ─── ROAS & Revenue ─── */}
          <div>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
              Return on Ad Spend
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                label="ROAS"
                value={summary && summary.roas > 0 ? `${summary.roas.toFixed(1)}x` : '–'}
                sub={summary && summary.spend > 0 ? `€ ${fmtEuro(summary.revenue_won)} / € ${fmtEuro(summary.spend)}` : undefined}
                icon={<TrendingUp className="w-5 h-5" />}
                iconBg={summary && summary.roas >= 5 ? 'bg-green-50' : 'bg-red-50'}
                iconColor={summary && summary.roas >= 5 ? 'text-green-600' : 'text-red-600'}
              />
              <KpiCard
                label="Revenue (Meta Ads)"
                value={summary ? `€ ${fmtEuro(summary.revenue_won)}` : '–'}
                sub={summary ? `${summary.deals_won} Deals via Meta geclosed` : undefined}
                icon={<Trophy className="w-5 h-5" />}
                iconBg="bg-green-50"
                iconColor="text-green-600"
              />
              <KpiCard
                label="Offene Deals (Meta)"
                value={summary ? `€ ${fmtEuro(summary.revenue_open)}` : '–'}
                sub={summary ? `${summary.deals_open} Deals offen` : undefined}
                icon={<Clock className="w-5 h-5" />}
                iconBg="bg-amber-50"
                iconColor="text-amber-600"
              />
              <KpiCard
                label="Gesamt Revenue"
                value={summary ? `€ ${fmtEuro(summary.total_revenue_won)}` : '–'}
                sub={summary ? `${summary.total_deals_won} Deals alle Quellen` : undefined}
                icon={<Percent className="w-5 h-5" />}
                iconBg="bg-blue-50"
                iconColor="text-blue-600"
              />
            </div>
          </div>

          {/* ─── Pipeline & Quoten ─── */}
          <div>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
              Pipeline & Quoten
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                label="Leads (Pipeline)"
                value={summary ? String(summary.leads) : '–'}
                sub={summary && summary.pixel_leads > 0 ? `Meta Pixel: ${summary.pixel_leads}` : undefined}
                icon={<Users className="w-5 h-5" />}
                iconBg="bg-blue-50"
                iconColor="text-blue-600"
              />
              <KpiCard
                label="Quali-Rate"
                value={summary ? `${summary.quali_rate}%` : '–'}
                sub={summary ? `${summary.closing_count} im Closing` : undefined}
                icon={<Filter className="w-5 h-5" />}
                iconBg={summary && summary.quali_rate >= 40 ? 'bg-green-50' : 'bg-amber-50'}
                iconColor={summary && summary.quali_rate >= 40 ? 'text-green-600' : 'text-amber-600'}
              />
              <KpiCard
                label="Closing-Rate"
                value={summary ? `${summary.closing_rate}%` : '–'}
                sub={summary ? `${summary.won_count} Won von ${summary.closing_count} Closing` : undefined}
                icon={<CheckCircle className="w-5 h-5" />}
                iconBg={summary && summary.closing_rate >= 30 ? 'bg-green-50' : 'bg-amber-50'}
                iconColor={summary && summary.closing_rate >= 30 ? 'text-green-600' : 'text-amber-600'}
              />
              <KpiCard
                label="Win-Rate"
                value={summary ? `${summary.win_rate}%` : '–'}
                sub={summary ? `${summary.won_count} Won, ${summary.lost_count} Lost` : undefined}
                icon={<Target className="w-5 h-5" />}
                iconBg={summary && summary.win_rate >= 15 ? 'bg-green-50' : 'bg-red-50'}
                iconColor={summary && summary.win_rate >= 15 ? 'text-green-600' : 'text-red-600'}
              />
            </div>
          </div>

          {/* ─── Ad Performance ─── */}
          <div>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
              Anzeigen-Performance
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <KpiCard
                label="Ad Spend"
                value={summary ? `€ ${fmtEuro(summary.spend)}` : '–'}
                icon={<DollarSign className="w-5 h-5" />}
                iconBg="bg-gray-100"
                iconColor="text-gray-600"
              />
              <KpiCard
                label="CPL (Pipeline)"
                value={summary && summary.cpl > 0 ? `€ ${fmtEuro(summary.cpl)}` : '–'}
                sub={summary ? `${summary.leads} Leads` : undefined}
                icon={<Target className="w-5 h-5" />}
                iconBg="bg-red-50"
                iconColor="text-red-600"
              />
              <KpiCard
                label="Cost / Kunde"
                value={summary && summary.won_count > 0 ? `€ ${fmtEuro(summary.spend / summary.won_count)}` : '–'}
                sub={summary ? `${summary.won_count} Kunden` : undefined}
                icon={<Trophy className="w-5 h-5" />}
                iconBg="bg-green-50"
                iconColor="text-green-600"
              />
              <KpiCard
                label="CPC"
                value={summary && summary.cpc > 0 ? `€ ${fmtEuro(summary.cpc)}` : '–'}
                icon={<MousePointerClick className="w-5 h-5" />}
                iconBg="bg-orange-50"
                iconColor="text-orange-600"
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KpiCard
                label="CTR"
                value={summary ? fmtPct(summary.ctr) : '–'}
                icon={<TrendingUp className="w-5 h-5" />}
                iconBg="bg-green-50"
                iconColor="text-green-600"
              />
              <KpiCard
                label="Impressions"
                value={summary ? fmtCount(summary.impressions) : '–'}
                icon={<Eye className="w-5 h-5" />}
                iconBg="bg-purple-50"
                iconColor="text-purple-600"
              />
              <KpiCard
                label="Klicks"
                value={summary ? fmtCount(summary.clicks) : '–'}
                icon={<MousePointerClick className="w-5 h-5" />}
                iconBg="bg-indigo-50"
                iconColor="text-indigo-600"
              />
            </div>
          </div>

          {/* ─── Campaigns Table ─── */}
          <div>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
              Kampagnen
            </h2>
            <Card padding="none" className="overflow-hidden">
              {data.campaigns.length === 0 ? (
                <p className="text-sm text-gray-400 px-4 py-6">
                  Keine aktiven Kampagnen gefunden.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <TableHeader />
                    <tbody className="divide-y divide-gray-100">
                      {data.campaigns.map((c) => (
                        <tr
                          key={c.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-xs truncate">
                            {c.name}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={statusBadgeTone(c.status)}>
                              {statusLabel(c.status)}
                            </Badge>
                          </td>
                          <InsightCells insights={c.insights} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* ─── Ad Sets Table ─── */}
          <div>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
              Ad Sets
            </h2>
            <Card padding="none" className="overflow-hidden">
              {data.adsets.length === 0 ? (
                <p className="text-sm text-gray-400 px-4 py-6">
                  Keine Ad Sets gefunden.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <TableHeader withCampaign />
                    <tbody className="divide-y divide-gray-100">
                      {data.adsets.map((a) => (
                        <tr
                          key={a.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-[200px] truncate">
                            {a.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 max-w-[160px] truncate">
                            {a.campaign_name}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={statusBadgeTone(a.status)}>
                              {statusLabel(a.status)}
                            </Badge>
                          </td>
                          <InsightCells insights={a.insights} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
