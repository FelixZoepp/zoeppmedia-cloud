'use client';

import type { AdminDashboardData } from '@/lib/admin-dashboard';
import { Badge } from '@/components/ui/badge';
import { CandidatesChart } from './candidates-chart';
import { SourcesChart } from './sources-chart';
import { SourceDonut } from './source-donut';
import { User } from 'lucide-react';
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

const SOURCE_LABELS: Record<string, string> = {
  meta: 'Meta Ads',
  indeed: 'Indeed',
  manual: 'Manuell',
};

/* ── Card Shell ──────────────────────────────────────────── */

function DashCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-[var(--border-default)] rounded-[14px] p-6 ${className}`}>
      {children}
    </div>
  );
}

/* ── Section Label ───────────────────────────────────────── */

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="text-[11px] font-bold text-red-500 uppercase tracking-[0.08em]">
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
    <div className="space-y-8">

      {/* ── Page Header ──────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] font-bold text-red-500 uppercase tracking-[0.08em]">
            {dayName} &middot; KW {kw}
          </span>
          <h1 className="text-[28px] font-extrabold text-[var(--text-primary)] tracking-[var(--tracking-heading)] leading-[1.1] mt-1">
            Dashboard
          </h1>
        </div>
        <Link
          href="/invites"
          className="inline-flex items-center gap-1.5 px-5 h-10 rounded-full bg-[var(--accent-grad)] text-white text-[13px] font-semibold tracking-wide uppercase hover:opacity-90 transition-opacity"
        >
          + Neue Agentur
        </Link>
      </div>

      {/* ── KPI Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard label="AGENTUREN" value={String(data.totalAgencies)} sub={`${data.totalAgencies} aktiv`} />
        <KpiCard label="BEWERBER" value={String(data.totalCandidates)} sub="Gesamt" />
        <KpiCard label="NEU DIESE WOCHE" value={String(data.newCandidatesThisWeek)} sub={`KW ${kw}`} />
        <KpiCard label="EINGESTELLT" value={String(data.totalHired)} sub="Gesamt" />
        <KpiCard label="HIRE RATE" value={data.totalCandidates > 0 ? `${Math.round((data.totalHired / data.totalCandidates) * 100)}%` : '0%'} sub="Conversion" />
      </div>

      {/* ── Row 2: Chart + Quellen ───────────────────────── */}
      <div className="grid grid-cols-5 gap-5">
        <DashCard className="col-span-3">
          <SectionLabel>Recruiting</SectionLabel>
          <h2 className="text-[18px] font-bold text-[var(--text-primary)] mt-1 mb-5">
            Bewerber-Entwicklung
          </h2>
          <CandidatesChart data={data.candidatesOverTime} />
        </DashCard>

        <DashCard className="col-span-2">
          <SectionLabel>Quellen</SectionLabel>
          <h2 className="text-[18px] font-bold text-[var(--text-primary)] mt-1 mb-5">
            Quellen-Verteilung
          </h2>
          <SourceDonut data={data.sourceBreakdown} />
        </DashCard>
      </div>

      {/* ── Row 3: Neue Bewerber + Quellen-Bar ───────────── */}
      <div className="grid grid-cols-5 gap-5">
        <DashCard className="col-span-3">
          <div className="flex items-center justify-between">
            <div>
              <SectionLabel>Letzte Aktivität</SectionLabel>
              <h2 className="text-[18px] font-bold text-[var(--text-primary)] mt-1">
                Neue Bewerber
              </h2>
            </div>
          </div>
          {data.recentCandidates.length === 0 ? (
            <p className="text-[14px] text-[var(--text-tertiary)] mt-5">Noch keine Bewerber</p>
          ) : (
            <div className="mt-4 divide-y divide-[var(--border-default)]">
              {data.recentCandidates.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-3 first:pt-1">
                  <div className="w-8 h-8 rounded-full bg-[var(--surface-inset)] flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-[var(--text-tertiary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">{c.name}</span>
                    <span className="text-[13px] text-[var(--text-tertiary)] ml-2">
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
          <h2 className="text-[18px] font-bold text-[var(--text-primary)] mt-1 mb-5">
            Bewerber nach Quelle
          </h2>
          <SourcesChart data={data.sourceBreakdown} />
        </DashCard>
      </div>

      {/* ── Row 4: Top Agenturen (full width table) ──────── */}
      <DashCard>
        <div className="flex items-center justify-between mb-1">
          <div>
            <SectionLabel>Portfolio</SectionLabel>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mt-1">
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
          <p className="text-[14px] text-[var(--text-tertiary)] mt-4">Noch keine Agenturen</p>
        ) : (
          <table className="w-full mt-4">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-left pb-3 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Agentur</th>
                <th className="text-right pb-3 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Bewerber</th>
                <th className="text-right pb-3 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Eingestellt</th>
                <th className="text-right pb-3 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Hire Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.topAgencies.map((agency) => {
                const rate = agency.candidates > 0 ? Math.round((agency.hired / agency.candidates) * 100) : 0;
                const initial = agency.name.charAt(0).toUpperCase();
                return (
                  <tr key={agency.id} className="border-b border-[var(--border-default)] last:border-0">
                    <td className="py-3.5">
                      <Link href={`/clients/${agency.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                        <span className="w-8 h-8 rounded-full bg-gradient-to-b from-[#EF5B6F] to-red-500 text-white text-[12px] font-bold flex items-center justify-center shrink-0">
                          {initial}
                        </span>
                        <span className="text-[14px] font-medium text-[var(--text-primary)]">
                          {agency.name}
                        </span>
                      </Link>
                    </td>
                    <td className="text-right py-3.5 text-[14px] font-semibold text-[var(--text-primary)]">
                      {agency.candidates}
                    </td>
                    <td className="text-right py-3.5 text-[14px] font-semibold text-[var(--text-primary)]">
                      {agency.hired}
                    </td>
                    <td className="text-right py-3.5">
                      <span className={`text-[14px] font-semibold ${rate > 0 ? 'text-green-700' : 'text-[var(--text-tertiary)]'}`}>
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
        <div className="flex items-center justify-between mb-1">
          <div>
            <SectionLabel>Monitoring</SectionLabel>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mt-1">
              Agentur-Status
            </h2>
          </div>
          {data.totalProblems > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-600 text-[12px] font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              {data.totalProblems} aktive Problem{data.totalProblems !== 1 ? 'e' : ''}
            </span>
          )}
        </div>

        {data.agencyStatuses.length === 0 ? (
          <p className="text-[14px] text-[var(--text-tertiary)] mt-4">Noch keine Agenturen</p>
        ) : (
          <table className="w-full mt-4">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-left pb-3 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Agentur</th>
                <th className="text-center pb-3 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Status</th>
                <th className="text-right pb-3 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Kritisch</th>
                <th className="text-right pb-3 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Warnung</th>
                <th className="text-right pb-3 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide w-24"></th>
              </tr>
            </thead>
            <tbody>
              {data.agencyStatuses.map((a) => (
                <tr key={a.id} className="border-b border-[var(--border-default)] last:border-0">
                  <td className="py-3.5">
                    <Link href={`/clients/${a.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                      <span className="w-8 h-8 rounded-full bg-gradient-to-b from-[#EF5B6F] to-red-500 text-white text-[12px] font-bold flex items-center justify-center shrink-0">
                        {a.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-[14px] font-medium text-[var(--text-primary)]">{a.name}</span>
                    </Link>
                  </td>
                  <td className="text-center py-3.5">
                    <TrafficDot status={a.status} />
                  </td>
                  <td className="text-right py-3.5 text-[14px] font-semibold text-[var(--text-primary)]">
                    {a.criticalCount > 0 ? (
                      <span className="text-red-600">{a.criticalCount}</span>
                    ) : (
                      <span className="text-[var(--text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="text-right py-3.5 text-[14px] font-semibold text-[var(--text-primary)]">
                    {a.warningCount > 0 ? (
                      <span className="text-amber-600">{a.warningCount}</span>
                    ) : (
                      <span className="text-[var(--text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="text-right py-3.5">
                    <Link
                      href={`/clients/${a.id}`}
                      className="text-[12px] font-semibold text-red-500 hover:text-red-600 uppercase tracking-wide transition-colors"
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

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-[var(--border-default)] rounded-[14px] px-5 py-5">
      <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.06em] block mb-2">
        {label}
      </span>
      <span className="text-[36px] font-extrabold text-[var(--text-primary)] leading-none tracking-tight block">
        {value}
      </span>
      <span className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-wide mt-2 block">
        {sub}
      </span>
    </div>
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
