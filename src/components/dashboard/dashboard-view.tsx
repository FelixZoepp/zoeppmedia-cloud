'use client';

import type { DashboardData } from '@/lib/dashboard';
import { CandidatesChart } from './candidates-chart';
import { SourcesChart } from './sources-chart';
import { PipelineChart } from './pipeline-chart';
import { SourceDonut } from './source-donut';
import { User } from 'lucide-react';

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

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/* ── Shared Components ───────────────────────────────────── */

function DashCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/75 backdrop-blur-[20px] border border-[var(--border-default)] rounded-[16px] p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${className}`}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="label-caps text-[#E31B23]">
      {children}
    </span>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white/75 backdrop-blur-[20px] border border-[var(--border-default)] rounded-[16px] px-8 py-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <span className="label-caps text-[var(--text-tertiary)] block mb-4">
        {label}
      </span>
      <span className="text-[42px] font-extrabold text-[var(--text-primary)] leading-none tracking-tight block">
        {value}
      </span>
      <span className="text-[14px] text-[var(--text-tertiary)] uppercase tracking-wide mt-4 block">
        {sub}
      </span>
    </div>
  );
}

/* ── Main View ───────────────────────────────────────────── */

interface DashboardViewProps {
  data: DashboardData;
  agencyName: string;
  pendingSurveys?: number;
}

export function DashboardView({ data, agencyName, pendingSurveys = 0 }: DashboardViewProps) {
  const now = new Date();
  const dayName = now.toLocaleDateString('de-DE', { weekday: 'long' }).toUpperCase();
  const kw = getISOWeek(now);
  const hireRate = data.totalCandidates > 0 ? Math.round((data.hired / data.totalCandidates) * 100) : 0;

  return (
    <div className="space-y-8">

      {/* ── Pending Survey Banner ─────────────────────────── */}
      {pendingSurveys > 0 && (
        <a
          href="/reports"
          className="flex items-center justify-between gap-4 rounded-[12px] border border-yellow-300 bg-yellow-50 px-5 py-4 text-yellow-900 hover:bg-yellow-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-[20px]">📋</span>
            <div>
              <p className="text-[14px] font-semibold leading-tight">
                Du hast {pendingSurveys === 1 ? 'einen' : pendingSurveys} offene{pendingSurveys === 1 ? 'n' : ''} Feedback-Check{pendingSurveys > 1 ? 's' : ''}
              </p>
              <p className="text-[12px] text-yellow-700 mt-0.5">
                Dein Feedback hilft uns, deine Kampagne zu verbessern.
              </p>
            </div>
          </div>
          <span className="text-[13px] font-semibold shrink-0 underline underline-offset-2">
            Jetzt ausfüllen →
          </span>
        </a>
      )}

      {/* ── Page Header ──────────────────────────────────── */}
      <div>
        <span className="label-caps text-[#E31B23]">
          {dayName} &middot; KW {kw}
        </span>
        <h1 className="text-[28px] font-extrabold text-[var(--text-primary)] tracking-[var(--tracking-heading)] leading-[1.1] mt-1">
          Dashboard
        </h1>
      </div>

      {/* ── KPI Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-5">
        <KpiCard label="BEWERBER" value={String(data.totalCandidates)} sub="Gesamt" />
        <KpiCard label="NEU DIESE WOCHE" value={String(data.newThisWeek)} sub={`KW ${kw}`} />
        <KpiCard label="EINGESTELLT" value={String(data.hired)} sub="Gesamt" />
        <KpiCard label="HIRE RATE" value={`${hireRate}%`} sub="Conversion" />
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

      {/* ── Row 3: Pipeline + Source Bar ──────────────────── */}
      <div className="grid grid-cols-2 gap-5">
        <DashCard>
          <SectionLabel>Pipeline</SectionLabel>
          <h2 className="text-[18px] font-bold text-[var(--text-primary)] mt-1 mb-5">
            Bewerber nach Phase
          </h2>
          <PipelineChart data={data.stageBreakdown} />
        </DashCard>

        <DashCard>
          <SectionLabel>Kanäle</SectionLabel>
          <h2 className="text-[18px] font-bold text-[var(--text-primary)] mt-1 mb-5">
            Bewerber nach Quelle
          </h2>
          <SourcesChart data={data.sourceBreakdown} />
        </DashCard>
      </div>

      {/* ── Row 4: Recent Candidates ─────────────────────── */}
      <DashCard>
        <div className="flex items-center justify-between mb-1">
          <div>
            <SectionLabel>Letzte Aktivität</SectionLabel>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mt-1">
              Neue Bewerber
            </h2>
          </div>
        </div>

        {data.recentCandidates.length === 0 ? (
          <p className="text-[14px] text-[var(--text-tertiary)] mt-4">Noch keine Bewerber</p>
        ) : (
          <div className="mt-4 divide-y divide-[var(--border-default)]">
            {data.recentCandidates.map((c) => (
              <a
                key={c.id}
                href={`/candidates/${c.id}`}
                className="flex items-center gap-3 py-4 first:pt-1 hover:bg-[var(--surface-subtle)] -mx-6 px-6 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-[var(--surface-inset)] flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-[var(--text-tertiary)]" />
                </div>
                <span className="flex-1 text-[14px] font-medium text-[var(--text-primary)]">{c.name}</span>
                <span className="text-[12px] text-[var(--text-tertiary)] shrink-0">
                  {SOURCE_LABELS[c.source] || c.source}
                </span>
                <span className="text-[12px] text-[var(--text-tertiary)] shrink-0 w-24 text-right">
                  {timeAgo(c.created_at)}
                </span>
              </a>
            ))}
          </div>
        )}
      </DashCard>
    </div>
  );
}
