'use client';

import type { AdminDashboardData } from '@/lib/admin-dashboard';
import { CandidatesChart } from './candidates-chart';
import { SourcesChart } from './sources-chart';
import { SourceDonut } from './source-donut';
import { User, Search, Bell, Settings, Users, TrendingUp, BarChart3, Award, Target, Plus, UserCircle } from 'lucide-react';
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

/* ── Glass Card ──────────────────────────────────────────── */

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/75 backdrop-blur-[20px] rounded-[16px] border border-[var(--border-default)] border-t-[rgba(255,255,255,0.8)] border-l-[rgba(255,255,255,0.4)] shadow-[var(--shadow-xs)] p-8 ${className}`}>
      {children}
    </div>
  );
}

/* ── Section Label (JetBrains Mono caps) ─────────────────── */

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="label-caps text-[#E31B23] block">
      {children}
    </span>
  );
}

/* ── Main View ───────────────────────────────────────────── */

export function AdminDashboardView({ data }: { data: AdminDashboardData }) {
  const now = new Date();
  const dayName = now.toLocaleDateString('de-DE', { weekday: 'long' }).toUpperCase();
  const kw = getISOWeek(now);

  return (
    <div className="space-y-8">

      {/* ── Top Bar (Search + Icons) ─────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 bg-white/60 backdrop-blur-sm border border-[var(--border-default)] rounded-full px-5 py-2.5 w-[300px]">
            <Search className="w-4 h-4 text-[var(--text-tertiary)]" />
            <span className="text-[14px] text-[var(--text-tertiary)]">Suchen... (Kunde, Bewerber)</span>
          </div>
          <button className="relative w-10 h-10 rounded-full bg-white/60 backdrop-blur-sm border border-[var(--border-default)] flex items-center justify-center hover:bg-white transition-all duration-200">
            <Bell className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
            <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-[#E31B23]" />
          </button>
          <Link href="/admin/kpi" className="w-10 h-10 rounded-full bg-white/60 backdrop-blur-sm border border-[var(--border-default)] flex items-center justify-center hover:bg-white transition-all duration-200">
            <Settings className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
          </Link>
          <Link href="/settings" className="w-10 h-10 rounded-full bg-white/60 backdrop-blur-sm border border-[var(--border-default)] flex items-center justify-center hover:bg-white transition-all duration-200">
            <UserCircle className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
          </Link>
        </div>
      </div>

      {/* ── Greeting ─────────────────────────────────────── */}
      <div>
        <span className="label-caps text-[#E31B23]">
          {dayName} &middot; KW {kw}
        </span>
        <h1 className="text-[40px] font-extrabold text-[var(--text-primary)] tracking-[-0.02em] leading-[1.15] mt-2">
          {getGreeting()}, Felix.
        </h1>
      </div>

      {/* ── KPI Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-5">
        <KpiCard icon={<Users className="w-5 h-5" />} iconBg="bg-red-50 text-[#E31B23]" label="Agenturen" value={String(data.totalAgencies)} sub={`${data.totalAgencies} aktiv`} />
        <KpiCard icon={<TrendingUp className="w-5 h-5" />} iconBg="bg-red-50 text-[#E31B23]" label="Bewerber" value={String(data.totalCandidates)} sub="Gesamt" />
        <KpiCard icon={<BarChart3 className="w-5 h-5" />} iconBg="bg-[var(--surface-subtle)] text-[var(--text-secondary)]" label="Neu diese Woche" value={String(data.newCandidatesThisWeek)} sub={`KW ${kw}`} />
        <KpiCard icon={<Award className="w-5 h-5" />} iconBg="bg-[var(--surface-subtle)] text-[var(--text-secondary)]" label="Eingestellt" value={String(data.totalHired)} sub="Gesamt" />
        <KpiCard icon={<Target className="w-5 h-5" />} iconBg="bg-[var(--surface-subtle)] text-[var(--text-secondary)]" label="Hire Rate" value={data.totalCandidates > 0 ? `${Math.round((data.totalHired / data.totalCandidates) * 100)}%` : '0%'} sub="Conversion" />
      </div>

      {/* ── Quick Actions ────────────────────────────────── */}
      <div>
        <SectionLabel>Schnellzugriff</SectionLabel>
        <h2 className="text-[24px] font-bold text-[var(--text-primary)] mt-1.5 mb-6">
          Deine Aktionen
        </h2>
        <div className="grid grid-cols-5 gap-5">
          <QuickAction icon={<Plus className="w-6 h-6" />} color="bg-red-50 text-[#E31B23]" title="Neue Agentur" desc="Kunden einladen" href="/invites" />
          <QuickAction icon={<Users className="w-6 h-6" />} color="bg-red-50 text-[#E31B23]" title="Kunden" desc="Alle Agenturen" href="/clients" />
          <QuickAction icon={<BarChart3 className="w-6 h-6" />} color="bg-[var(--surface-subtle)] text-[var(--text-secondary)]" title="Playbook" desc="Handlungsanweisungen" href="/playbook" />
          <QuickAction icon={<Target className="w-6 h-6" />} color="bg-[var(--surface-subtle)] text-[var(--text-secondary)]" title="KPI Settings" desc="Zielwerte verwalten" href="/admin/kpi" />
          <QuickAction icon={<Users className="w-6 h-6" />} color="bg-[var(--surface-subtle)] text-[var(--text-secondary)]" title="Team" desc="Mitarbeiter verwalten" href="/team" />
        </div>
      </div>

      {/* ── Row 2: Chart + Quellen ───────────────────────── */}
      <div className="grid grid-cols-5 gap-5">
        <GlassCard className="col-span-3">
          <SectionLabel>Recruiting</SectionLabel>
          <h2 className="text-[24px] font-bold text-[var(--text-primary)] mt-1.5 mb-6">
            Bewerber-Entwicklung
          </h2>
          <CandidatesChart data={data.candidatesOverTime} />
        </GlassCard>

        <GlassCard className="col-span-2">
          <SectionLabel>Quellen</SectionLabel>
          <h2 className="text-[24px] font-bold text-[var(--text-primary)] mt-1.5 mb-6">
            Quellen-Verteilung
          </h2>
          <SourceDonut data={data.sourceBreakdown} />
        </GlassCard>
      </div>

      {/* ── Row 3: Neue Bewerber + Quellen-Bar ───────────── */}
      <div className="grid grid-cols-5 gap-5">
        <GlassCard className="col-span-3">
          <SectionLabel>Letzte Aktivität</SectionLabel>
          <h2 className="text-[24px] font-bold text-[var(--text-primary)] mt-1.5">
            Neue Bewerber
          </h2>
          {data.recentCandidates.length === 0 ? (
            <p className="text-[15px] text-[var(--text-tertiary)] mt-6">Noch keine Bewerber</p>
          ) : (
            <div className="mt-6">
              {data.recentCandidates.map((c) => (
                <div key={c.id} className="flex items-center gap-4 py-4 hover:bg-[var(--surface-subtle)]/50 -mx-3 px-3 rounded-[10px] transition-colors duration-200">
                  <div className="w-9 h-9 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-[var(--text-tertiary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[15px] font-semibold text-[var(--text-primary)]">{c.name}</span>
                    <span className="text-[14px] text-[var(--text-tertiary)] ml-3">{c.agency_name}</span>
                  </div>
                  <span className="label-caps text-[var(--text-tertiary)] shrink-0">
                    {SOURCE_LABELS[c.source] || c.source}
                  </span>
                  <span className="text-[13px] text-[var(--text-tertiary)] shrink-0 w-24 text-right">
                    {timeAgo(c.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard className="col-span-2">
          <SectionLabel>Kanäle</SectionLabel>
          <h2 className="text-[24px] font-bold text-[var(--text-primary)] mt-1.5 mb-6">
            Bewerber nach Quelle
          </h2>
          <SourcesChart data={data.sourceBreakdown} />
        </GlassCard>
      </div>

      {/* ── Row 4: Agenturen ─────────────────────────────── */}
      <GlassCard>
        <div className="flex items-center justify-between">
          <div>
            <SectionLabel>Portfolio</SectionLabel>
            <h2 className="text-[24px] font-bold text-[var(--text-primary)] mt-1.5">
              Agenturen
            </h2>
          </div>
          <Link href="/clients" className="label-caps text-[#E31B23] hover:text-[#C00015] transition-colors">
            Alle Kunden →
          </Link>
        </div>

        {data.topAgencies.length === 0 ? (
          <p className="text-[15px] text-[var(--text-tertiary)] mt-6">Noch keine Agenturen</p>
        ) : (
          <table className="w-full mt-6">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-left pb-3 label-caps text-[var(--text-tertiary)]">Agentur</th>
                <th className="text-right pb-3 label-caps text-[var(--text-tertiary)]">Bewerber</th>
                <th className="text-right pb-3 label-caps text-[var(--text-tertiary)]">Eingestellt</th>
                <th className="text-right pb-3 label-caps text-[var(--text-tertiary)]">Hire Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.topAgencies.map((agency) => {
                const rate = agency.candidates > 0 ? Math.round((agency.hired / agency.candidates) * 100) : 0;
                return (
                  <tr key={agency.id} className="border-b border-[var(--border-default)]/50 last:border-0 hover:bg-[var(--surface-subtle)]/30 transition-colors">
                    <td className="py-4">
                      <Link href={`/clients/${agency.id}`} className="flex items-center gap-3.5 hover:opacity-80 transition-opacity">
                        <span className="w-9 h-9 rounded-full bg-gradient-to-b from-[#E31B23] to-[#C00015] text-white text-[13px] font-bold flex items-center justify-center shrink-0">
                          {agency.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="text-[15px] font-medium text-[var(--text-primary)]">{agency.name}</span>
                      </Link>
                    </td>
                    <td className="text-right py-4 text-[15px] font-semibold text-[var(--text-primary)]">{agency.candidates}</td>
                    <td className="text-right py-4 text-[15px] font-semibold text-[var(--text-primary)]">{agency.hired}</td>
                    <td className="text-right py-4">
                      <span className={`text-[15px] font-semibold ${rate > 0 ? 'text-green-600' : 'text-[var(--text-tertiary)]'}`}>{rate}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </GlassCard>

      {/* ── Row 5: Agentur-Status (Ampel) ────────────────── */}
      <GlassCard>
        <div className="flex items-center justify-between">
          <div>
            <SectionLabel>Monitoring</SectionLabel>
            <h2 className="text-[24px] font-bold text-[var(--text-primary)] mt-1.5">Agentur-Status</h2>
          </div>
          {data.totalProblems > 0 && (
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-50 text-[#C00015] text-[13px] font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#E31B23] inline-block" />
              {data.totalProblems} aktive Problem{data.totalProblems !== 1 ? 'e' : ''}
            </span>
          )}
        </div>

        {data.agencyStatuses.length === 0 ? (
          <p className="text-[15px] text-[var(--text-tertiary)] mt-6">Noch keine Agenturen</p>
        ) : (
          <table className="w-full mt-6">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-left pb-3 label-caps text-[var(--text-tertiary)]">Agentur</th>
                <th className="text-center pb-3 label-caps text-[var(--text-tertiary)]">Status</th>
                <th className="text-right pb-3 label-caps text-[var(--text-tertiary)]">Kritisch</th>
                <th className="text-right pb-3 label-caps text-[var(--text-tertiary)]">Warnung</th>
                <th className="text-right pb-3 label-caps text-[var(--text-tertiary)] w-24"></th>
              </tr>
            </thead>
            <tbody>
              {data.agencyStatuses.map((a) => (
                <tr key={a.id} className="border-b border-[var(--border-default)]/50 last:border-0 hover:bg-[var(--surface-subtle)]/30 transition-colors">
                  <td className="py-4">
                    <Link href={`/clients/${a.id}`} className="flex items-center gap-3.5 hover:opacity-80 transition-opacity">
                      <span className="w-9 h-9 rounded-full bg-gradient-to-b from-[#E31B23] to-[#C00015] text-white text-[13px] font-bold flex items-center justify-center shrink-0">
                        {a.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-[15px] font-medium text-[var(--text-primary)]">{a.name}</span>
                    </Link>
                  </td>
                  <td className="text-center py-4"><TrafficDot status={a.status} /></td>
                  <td className="text-right py-4 text-[15px] font-semibold">
                    {a.criticalCount > 0 ? <span className="text-[#C00015]">{a.criticalCount}</span> : <span className="text-[var(--text-tertiary)]">—</span>}
                  </td>
                  <td className="text-right py-4 text-[15px] font-semibold">
                    {a.warningCount > 0 ? <span className="text-amber-600">{a.warningCount}</span> : <span className="text-[var(--text-tertiary)]">—</span>}
                  </td>
                  <td className="text-right py-4">
                    <Link href={`/clients/${a.id}`} className="label-caps text-[#E31B23] hover:text-[#C00015] transition-colors">Details →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>
    </div>
  );
}

/* ── KPI Card ────────────────────────────────────────────── */

function KpiCard({ icon, iconBg, label, value, sub }: { icon: React.ReactNode; iconBg: string; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white/75 backdrop-blur-[20px] rounded-[16px] border border-[var(--border-default)] border-t-[rgba(255,255,255,0.8)] px-6 py-6 shadow-[var(--shadow-xs)] transition-all duration-200 hover:shadow-[var(--shadow-sm)] hover:-translate-y-0.5">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
        <span className="label-caps text-[var(--text-tertiary)]">{label}</span>
      </div>
      <span className="text-[32px] font-extrabold text-[var(--text-primary)] leading-none tracking-tight block">
        {value}
      </span>
      <span className="label-caps text-[var(--text-tertiary)] mt-2 block">
        {sub}
      </span>
    </div>
  );
}

/* ── Quick Action Card ───────────────────────────────────── */

function QuickAction({ icon, color, title, desc, href }: { icon: React.ReactNode; color: string; title: string; desc: string; href: string }) {
  return (
    <Link href={href} className="group bg-white/75 backdrop-blur-[20px] p-7 rounded-[16px] border border-[var(--border-default)] border-t-[rgba(255,255,255,0.8)] shadow-[var(--shadow-xs)] transition-all duration-300 ease-out hover:shadow-[var(--shadow-md)] hover:-translate-y-1">
      <div className={`w-14 h-14 rounded-[14px] ${color} flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-105`}>
        {icon}
      </div>
      <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
      <p className="text-[14px] text-[var(--text-tertiary)] leading-relaxed">{desc}</p>
      <span className="label-caps text-[#E31B23] mt-4 block transition-transform duration-300 group-hover:translate-x-1">
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
    red: { bg: 'bg-[#E31B23]', ring: 'ring-red-200', label: 'Kritisch' },
  } as const;
  const { bg, ring, label } = map[status];
  return (
    <span className="inline-flex items-center justify-center" title={label}>
      <span className={`w-3 h-3 rounded-full ${bg} ring-2 ${ring}`} />
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
