'use client';

import type { AdminDashboardData } from '@/lib/admin-dashboard';
import { CandidatesChart } from './candidates-chart';
import { SourcesChart } from './sources-chart';
import { SourceDonut } from './source-donut';
import { GlobalSearch } from '@/components/global-search';
import { User, Bell, Settings, Users, TrendingUp, BarChart3, Award, Target, Plus, UserCircle } from 'lucide-react';
import Link from 'next/link';

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return 'Gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Gestern';
  if (diffD < 7) return `vor ${diffD} Tagen`;
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Guten Morgen';
  if (h < 18) return 'Guten Nachmittag';
  return 'Guten Abend';
}

const SOURCE_LABELS: Record<string, string> = { meta: 'Meta Ads', indeed: 'Indeed', manual: 'Manuell' };

export function AdminDashboardView({ data }: { data: AdminDashboardData }) {
  const now = new Date();
  const dayName = now.toLocaleDateString('de-DE', { weekday: 'long' }).toUpperCase();
  const kw = getISOWeek(now);

  return (
    <div className="space-y-8">

      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <GlobalSearch />
          <button className="relative w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 shadow-sm">
            <Bell className="w-4 h-4 text-gray-500" />
            <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-red-500" />
          </button>
          <Link href="/admin/kpi" className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 shadow-sm">
            <Settings className="w-4 h-4 text-gray-500" />
          </Link>
          <Link href="/settings" className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 shadow-sm">
            <UserCircle className="w-4 h-4 text-gray-500" />
          </Link>
        </div>
      </div>

      {/* Greeting */}
      <div>
        <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">
          {dayName} &middot; KW {kw}
        </span>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 tracking-tight mt-2">
          {getGreeting()}, Felix.
        </h1>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={<Users className="w-5 h-5" />} iconBg="bg-red-50 text-red-600" label="Agenturen" value={String(data.totalAgencies)} sub={`${data.totalAgencies} aktiv`} />
        <KpiCard icon={<TrendingUp className="w-5 h-5" />} iconBg="bg-red-50 text-red-600" label="Bewerber" value={String(data.totalCandidates)} sub="Gesamt" />
        <KpiCard icon={<BarChart3 className="w-5 h-5" />} iconBg="bg-gray-100 text-gray-600" label="Neu diese Woche" value={String(data.newCandidatesThisWeek)} sub={`KW ${kw}`} />
        <KpiCard icon={<Award className="w-5 h-5" />} iconBg="bg-gray-100 text-gray-600" label="Eingestellt" value={String(data.totalHired)} sub="Gesamt" />
        <KpiCard icon={<Target className="w-5 h-5" />} iconBg="bg-gray-100 text-gray-600" label="Hire Rate" value={data.totalCandidates > 0 ? `${Math.round((data.totalHired / data.totalCandidates) * 100)}%` : '0%'} sub="Conversion" />
      </div>

      {/* Quick Actions */}
      <div>
        <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">Schnellzugriff</span>
        <h2 className="text-xl font-bold text-gray-900 mt-1 mb-4">Deine Aktionen</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <QuickAction icon={<Plus className="w-6 h-6" />} color="bg-red-50 text-red-600" title="Neue Agentur" desc="Kunden einladen" href="/invites" />
          <QuickAction icon={<Users className="w-6 h-6" />} color="bg-red-50 text-red-600" title="Kunden" desc="Alle Agenturen" href="/clients" />
          <QuickAction icon={<BarChart3 className="w-6 h-6" />} color="bg-gray-100 text-gray-600" title="Playbook" desc="Handlungsanweisungen" href="/playbook" />
          <QuickAction icon={<Target className="w-6 h-6" />} color="bg-gray-100 text-gray-600" title="KPI Settings" desc="Zielwerte verwalten" href="/admin/kpi" />
          <QuickAction icon={<Users className="w-6 h-6" />} color="bg-gray-100 text-gray-600" title="Team" desc="Mitarbeiter verwalten" href="/team" />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 shadow-sm p-5 md:p-8">
          <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">Recruiting</span>
          <h2 className="text-lg font-bold text-gray-900 mt-1 mb-4">Bewerber-Entwicklung</h2>
          <CandidatesChart data={data.candidatesOverTime} />
        </div>
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5 md:p-8">
          <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">Quellen</span>
          <h2 className="text-lg font-bold text-gray-900 mt-1 mb-4">Quellen-Verteilung</h2>
          <SourceDonut data={data.sourceBreakdown} />
        </div>
      </div>

      {/* Recent + Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 shadow-sm p-5 md:p-8">
          <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">Letzte Aktivität</span>
          <h2 className="text-lg font-bold text-gray-900 mt-1">Neue Bewerber</h2>
          {data.recentCandidates.length === 0 ? (
            <p className="text-sm text-gray-400 mt-4">Noch keine Bewerber</p>
          ) : (
            <div className="mt-4 divide-y divide-gray-100">
              {data.recentCandidates.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900">{c.name}</span>
                    <span className="text-sm text-gray-400 ml-2">{c.agency_name}</span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{SOURCE_LABELS[c.source] || c.source}</span>
                  <span className="text-xs text-gray-400 shrink-0 w-20 text-right">{timeAgo(c.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5 md:p-8">
          <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">Kanäle</span>
          <h2 className="text-lg font-bold text-gray-900 mt-1 mb-4">Bewerber nach Quelle</h2>
          <SourcesChart data={data.sourceBreakdown} />
        </div>
      </div>

      {/* Agencies Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">Portfolio</span>
            <h2 className="text-lg font-bold text-gray-900 mt-1">Agenturen</h2>
          </div>
          <Link href="/clients" className="text-xs font-semibold text-red-600 uppercase tracking-wider hover:text-red-700">Alle Kunden →</Link>
        </div>
        {data.topAgencies.length === 0 ? (
          <p className="text-sm text-gray-400 mt-4">Noch keine Agenturen</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full mt-4">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left pb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Agentur</th>
                <th className="text-right pb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Bewerber</th>
                <th className="text-right pb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Eingestellt</th>
                <th className="text-right pb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Hire Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.topAgencies.map((agency) => {
                const rate = agency.candidates > 0 ? Math.round((agency.hired / agency.candidates) * 100) : 0;
                return (
                  <tr key={agency.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3">
                      <Link href={`/clients/${agency.id}`} className="flex items-center gap-3 hover:opacity-80">
                        <span className="w-8 h-8 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{agency.name.charAt(0)}</span>
                        <span className="text-sm font-medium text-gray-900">{agency.name}</span>
                      </Link>
                    </td>
                    <td className="text-right py-3 text-sm font-semibold text-gray-900">{agency.candidates}</td>
                    <td className="text-right py-3 text-sm font-semibold text-gray-900">{agency.hired}</td>
                    <td className="text-right py-3 text-sm font-semibold">{rate > 0 ? <span className="text-green-600">{rate}%</span> : <span className="text-gray-400">0%</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Status Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">Monitoring</span>
            <h2 className="text-lg font-bold text-gray-900 mt-1">Agentur-Status</h2>
          </div>
          {data.totalProblems > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-600 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {data.totalProblems} Problem{data.totalProblems !== 1 ? 'e' : ''}
            </span>
          )}
        </div>
        {data.agencyStatuses.length === 0 ? (
          <p className="text-sm text-gray-400 mt-4">Noch keine Agenturen</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full mt-4">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left pb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Agentur</th>
                <th className="text-center pb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-right pb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Kritisch</th>
                <th className="text-right pb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Warnung</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {data.agencyStatuses.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-3">
                    <Link href={`/clients/${a.id}`} className="flex items-center gap-3 hover:opacity-80">
                      <span className="w-8 h-8 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{a.name.charAt(0)}</span>
                      <span className="text-sm font-medium text-gray-900">{a.name}</span>
                    </Link>
                  </td>
                  <td className="text-center py-3">
                    <span className={`w-3 h-3 rounded-full inline-block ${a.status === 'red' ? 'bg-red-500' : a.status === 'yellow' ? 'bg-amber-400' : 'bg-green-500'}`} />
                  </td>
                  <td className="text-right py-3 text-sm font-semibold">{a.criticalCount > 0 ? <span className="text-red-600">{a.criticalCount}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="text-right py-3 text-sm font-semibold">{a.warningCount > 0 ? <span className="text-amber-600">{a.warningCount}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="text-right py-3"><Link href={`/clients/${a.id}`} className="text-xs font-semibold text-red-600 hover:text-red-700">Details →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon, iconBg, label, value, sub }: { icon: React.ReactNode; iconBg: string; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-5 md:px-8 md:py-7">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center`}>{icon}</div>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-4xl font-extrabold text-gray-900 leading-none block">{value}</span>
      <span className="text-xs text-gray-400 uppercase tracking-wider mt-2 block">{sub}</span>
    </div>
  );
}

function QuickAction({ icon, color, title, desc, href }: { icon: React.ReactNode; color: string; title: string; desc: string; href: string }) {
  return (
    <Link href={href} className="group bg-white p-5 md:p-8 rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className={`w-14 h-14 rounded-xl ${color} flex items-center justify-center mb-5`}>{icon}</div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-400">{desc}</p>
      <span className="text-sm font-semibold text-red-600 mt-4 block group-hover:translate-x-0.5 transition-transform">Öffnen →</span>
    </Link>
  );
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
