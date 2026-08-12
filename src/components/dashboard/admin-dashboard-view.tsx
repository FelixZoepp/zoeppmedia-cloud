'use client';

import type { AdminDashboardData } from '@/lib/admin-dashboard';
import { Badge } from '@/components/ui/badge';
import { CandidatesChart } from './candidates-chart';
import { SourcesChart } from './sources-chart';
import { SourceDonut } from './source-donut';
import { User, Search, Bell, Settings, Users, TrendingUp, BarChart3, Award, Target, Plus } from 'lucide-react';
import Link from 'next/link';

/* ── Helpers ─────────────────────────────────────────────── */

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

const SOURCE_LABELS: Record<string, string> = {
  meta: 'Meta Ads',
  indeed: 'Indeed',
  manual: 'Manuell',
};

/* ── Card Shell ──────────────────────────────────────────── */

function DashCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-gray-100 rounded-[24px] p-12 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${className}`}>
      {children}
    </div>
  );
}

/* ── Section Label ───────────────────────────────────────── */

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="text-[11px] font-bold text-red-500 uppercase tracking-[0.1em] block">
      {children}
    </span>
  );
}

/* ── Main View ───────────────────────────────────────────── */

interface Props {
  data: AdminDashboardData;
}

export function AdminDashboardView({ data }: Props) {
  const now = new Date();
  const dayName = now.toLocaleDateString('de-DE', { weekday: 'long' }).toUpperCase();
  const kw = getISOWeek(now);

  return (
    <div className="space-y-10">

      {/* ── Top Header Bar ───────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold text-red-500 uppercase tracking-[0.1em]">
            {dayName} &middot; KW {kw}
          </span>
          <h1 className="text-[36px] font-extrabold text-[var(--text-primary)] tracking-tight leading-[1.1] mt-2">
            {getGreeting()}, Felix.
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-full px-5 py-2.5 w-[280px]">
            <Search className="w-4 h-4 text-gray-400" />
            <span className="text-[14px] text-gray-400">Suchen... (Kunde, Bewerber)</span>
          </div>
          <button className="w-10 h-10 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center hover:bg-gray-100 transition">
            <Bell className="w-4.5 h-4.5 text-gray-500" />
          </button>
          <Link href="/admin/kpi" className="w-10 h-10 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center hover:bg-gray-100 transition">
            <Settings className="w-4.5 h-4.5 text-gray-500" />
          </Link>
        </div>
      </div>

      {/* ── KPI Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-7">
        <KpiCard icon={<Users className="w-5 h-5 text-red-500" />} label="Agenturen" value={String(data.totalAgencies)} sub={`${data.totalAgencies} aktiv`} />
        <KpiCard icon={<TrendingUp className="w-5 h-5 text-blue-500" />} label="Bewerber" value={String(data.totalCandidates)} sub="Gesamt" />
        <KpiCard icon={<BarChart3 className="w-5 h-5 text-green-500" />} label="Neu diese Woche" value={String(data.newCandidatesThisWeek)} sub={`KW ${kw}`} />
        <KpiCard icon={<Award className="w-5 h-5 text-amber-500" />} label="Eingestellt" value={String(data.totalHired)} sub="Gesamt" />
        <KpiCard icon={<Target className="w-5 h-5 text-purple-500" />} label="Hire Rate" value={data.totalCandidates > 0 ? `${Math.round((data.totalHired / data.totalCandidates) * 100)}%` : '0%'} sub="Conversion" />
      </div>

      {/* ── Quick Actions ────────────────────────────────── */}
      <DashCard>
        <SectionLabel>Schnellzugriff</SectionLabel>
        <h2 className="text-[22px] font-bold text-[var(--text-primary)] mt-1.5 mb-6">
          Deine Aktionen
        </h2>
        <div className="grid grid-cols-5 gap-7">
          <QuickAction icon={<Plus className="w-6 h-6" />} color="bg-red-50 text-red-500" title="Neue Agentur" desc="Kunden einladen" href="/invites" />
          <QuickAction icon={<Users className="w-6 h-6" />} color="bg-blue-50 text-blue-500" title="Kunden" desc="Alle Agenturen" href="/clients" />
          <QuickAction icon={<BarChart3 className="w-6 h-6" />} color="bg-green-50 text-green-500" title="Playbook" desc="Handlungsanweisungen" href="/playbook" />
          <QuickAction icon={<Target className="w-6 h-6" />} color="bg-amber-50 text-amber-500" title="KPI Settings" desc="Zielwerte verwalten" href="/admin/kpi" />
          <QuickAction icon={<TrendingUp className="w-6 h-6" />} color="bg-purple-50 text-purple-500" title="Team" desc="Mitarbeiter verwalten" href="/team" />
        </div>
      </DashCard>

      {/* ── Row 2: Chart + Quellen ───────────────────────── */}
      <div className="grid grid-cols-5 gap-7">
        <DashCard className="col-span-3">
          <SectionLabel>Recruiting</SectionLabel>
          <h2 className="text-[22px] font-bold text-[var(--text-primary)] mt-2 mb-8">
            Bewerber-Entwicklung
          </h2>
          <CandidatesChart data={data.candidatesOverTime} />
        </DashCard>

        <DashCard className="col-span-2">
          <SectionLabel>Quellen</SectionLabel>
          <h2 className="text-[22px] font-bold text-[var(--text-primary)] mt-2 mb-8">
            Quellen-Verteilung
          </h2>
          <SourceDonut data={data.sourceBreakdown} />
        </DashCard>
      </div>

      {/* ── Row 3: Neue Bewerber + Quellen-Bar ───────────── */}
      <div className="grid grid-cols-5 gap-7">
        <DashCard className="col-span-3">
          <div className="flex items-center justify-between">
            <div>
              <SectionLabel>Letzte Aktivität</SectionLabel>
              <h2 className="text-[22px] font-bold text-[var(--text-primary)] mt-2">
                Neue Bewerber
              </h2>
            </div>
          </div>
          {data.recentCandidates.length === 0 ? (
            <p className="text-[14px] text-[var(--text-tertiary)] mt-6">Noch keine Bewerber</p>
          ) : (
            <div className="mt-6 divide-y divide-gray-100">
              {data.recentCandidates.map((c) => (
                <div key={c.id} className="flex items-center gap-4 py-5 first:pt-2">
                  <div className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[14px] font-semibold text-[var(--text-primary)]">{c.name}</span>
                    <span className="text-[13px] text-[var(--text-tertiary)] ml-3">
                      {c.agency_name}
                    </span>
                  </div>
                  <span className="text-[12px] text-[var(--text-tertiary)] shrink-0">
                    {SOURCE_LABELS[c.source] || c.source}
                  </span>
                  <span className="text-[12px] text-[var(--text-tertiary)] shrink-0 w-24 text-right">
                    {timeAgo(c.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DashCard>

        <DashCard className="col-span-2">
          <SectionLabel>Kanäle</SectionLabel>
          <h2 className="text-[22px] font-bold text-[var(--text-primary)] mt-2 mb-8">
            Bewerber nach Quelle
          </h2>
          <SourcesChart data={data.sourceBreakdown} />
        </DashCard>
      </div>

      {/* ── Row 4: Agenturen Tabelle ─────────────────────── */}
      <DashCard>
        <div className="flex items-center justify-between mb-2">
          <div>
            <SectionLabel>Portfolio</SectionLabel>
            <h2 className="text-[22px] font-bold text-[var(--text-primary)] mt-2">
              Agenturen
            </h2>
          </div>
          <Link
            href="/clients"
            className="text-[13px] font-semibold text-red-500 hover:text-red-600 uppercase tracking-wide transition-colors"
          >
            Alle Kunden →
          </Link>
        </div>

        {data.topAgencies.length === 0 ? (
          <p className="text-[14px] text-[var(--text-tertiary)] mt-6">Noch keine Agenturen</p>
        ) : (
          <table className="w-full mt-6">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left pb-4 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Agentur</th>
                <th className="text-right pb-4 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Bewerber</th>
                <th className="text-right pb-4 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Eingestellt</th>
                <th className="text-right pb-4 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Hire Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.topAgencies.map((agency) => {
                const rate = agency.candidates > 0 ? Math.round((agency.hired / agency.candidates) * 100) : 0;
                const initial = agency.name.charAt(0).toUpperCase();
                return (
                  <tr key={agency.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-5">
                      <Link href={`/clients/${agency.id}`} className="flex items-center gap-4 hover:opacity-80 transition-opacity">
                        <span className="w-9 h-9 rounded-full bg-gradient-to-b from-[#EF5B6F] to-red-500 text-white text-[13px] font-bold flex items-center justify-center shrink-0">
                          {initial}
                        </span>
                        <span className="text-[15px] font-medium text-[var(--text-primary)]">
                          {agency.name}
                        </span>
                      </Link>
                    </td>
                    <td className="text-right py-5 text-[15px] font-semibold text-[var(--text-primary)]">
                      {agency.candidates}
                    </td>
                    <td className="text-right py-5 text-[15px] font-semibold text-[var(--text-primary)]">
                      {agency.hired}
                    </td>
                    <td className="text-right py-5">
                      <span className={`text-[15px] font-semibold ${rate > 0 ? 'text-green-600' : 'text-[var(--text-tertiary)]'}`}>
                        {rate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </DashCard>

      {/* ── Row 5: Agentur-Status (Ampel) ────────────────── */}
      <DashCard>
        <div className="flex items-center justify-between mb-2">
          <div>
            <SectionLabel>Monitoring</SectionLabel>
            <h2 className="text-[22px] font-bold text-[var(--text-primary)] mt-2">
              Agentur-Status
            </h2>
          </div>
          {data.totalProblems > 0 && (
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-50 text-red-600 text-[13px] font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              {data.totalProblems} aktive Problem{data.totalProblems !== 1 ? 'e' : ''}
            </span>
          )}
        </div>

        {data.agencyStatuses.length === 0 ? (
          <p className="text-[14px] text-[var(--text-tertiary)] mt-6">Noch keine Agenturen</p>
        ) : (
          <table className="w-full mt-6">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left pb-4 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Agentur</th>
                <th className="text-center pb-4 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Status</th>
                <th className="text-right pb-4 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Kritisch</th>
                <th className="text-right pb-4 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Warnung</th>
                <th className="text-right pb-4 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide w-24"></th>
              </tr>
            </thead>
            <tbody>
              {data.agencyStatuses.map((a) => (
                <tr key={a.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-5">
                    <Link href={`/clients/${a.id}`} className="flex items-center gap-4 hover:opacity-80 transition-opacity">
                      <span className="w-9 h-9 rounded-full bg-gradient-to-b from-[#EF5B6F] to-red-500 text-white text-[13px] font-bold flex items-center justify-center shrink-0">
                        {a.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-[15px] font-medium text-[var(--text-primary)]">{a.name}</span>
                    </Link>
                  </td>
                  <td className="text-center py-5">
                    <TrafficDot status={a.status} />
                  </td>
                  <td className="text-right py-5 text-[15px] font-semibold">
                    {a.criticalCount > 0 ? (
                      <span className="text-red-600">{a.criticalCount}</span>
                    ) : (
                      <span className="text-[var(--text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="text-right py-5 text-[15px] font-semibold">
                    {a.warningCount > 0 ? (
                      <span className="text-amber-600">{a.warningCount}</span>
                    ) : (
                      <span className="text-[var(--text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="text-right py-5">
                    <Link
                      href={`/clients/${a.id}`}
                      className="text-[13px] font-semibold text-red-500 hover:text-red-600 uppercase tracking-wide transition-colors"
                    >
                      Details →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DashCard>
    </div>
  );
}

/* ── KPI Card ────────────────────────────────────────────── */

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-[20px] px-8 py-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-[12px] bg-gray-50 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.08em]">
          {label}
        </span>
      </div>
      <span className="text-[38px] font-extrabold text-[var(--text-primary)] leading-none tracking-tight block">
        {value}
      </span>
      <span className="text-[13px] text-[var(--text-tertiary)] mt-3 block">
        {sub}
      </span>
    </div>
  );
}

/* ── Quick Action Card ───────────────────────────────────── */

function QuickAction({ icon, color, title, desc, href }: { icon: React.ReactNode; color: string; title: string; desc: string; href: string }) {
  return (
    <Link href={href} className="group p-8 rounded-[18px] border border-gray-100 hover:border-gray-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all">
      <div className={`w-14 h-14 rounded-[14px] ${color} flex items-center justify-center mb-5`}>
        {icon}
      </div>
      <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-1.5">{title}</h3>
      <p className="text-[14px] text-[var(--text-tertiary)]">{desc}</p>
      <span className="text-[14px] font-semibold text-red-500 mt-4 block group-hover:translate-x-0.5 transition-transform">
        Öffnen →
      </span>
    </Link>
  );
}

/* ── Traffic Light Dot ───────────────────────────────────── */

function TrafficDot({ status }: { status: 'green' | 'yellow' | 'red' }) {
  const map = {
    green: { bg: 'bg-green-500', ring: 'ring-green-200', label: 'OK' },
    yellow: { bg: 'bg-amber-400', ring: 'ring-amber-200', label: 'Warnung' },
    red: { bg: 'bg-red-500', ring: 'ring-red-200', label: 'Kritisch' },
  } as const;
  const { bg, ring, label } = map[status];
  return (
    <span className="inline-flex items-center justify-center" title={label}>
      <span className={`w-3.5 h-3.5 rounded-full ${bg} ring-3 ${ring}`} />
    </span>
  );
}

/* ── ISO week helper ─────────────────────────────────────── */

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
