'use client';

import type { DashboardData } from '@/lib/dashboard';
import { CandidatesChart } from './candidates-chart';
import { SourcesChart } from './sources-chart';
import { PipelineChart } from './pipeline-chart';
import { SourceDonut } from './source-donut';
import { SlaAmpel } from './sla-ampel';
import { AccessItemsView } from './access-items-view';
import { ProjectOverview } from './project-overview';
import { MasterclassProgress } from './masterclass-progress';
import { KundenKennzahlen, type KundenKennzahlenDaten } from './kunden-kennzahlen';
import { Wochenstand } from './wochenstand';
import { Fahrplan } from './fahrplan';
import { Avatar, Badge, CountUp, SplitText, StatCard } from '@/components/ui';

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
    <div data-rise="" className={`min-w-0 rounded-xl bg-card p-[22px] shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CardTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-[19px] font-medium tracking-[-0.02em]">{children}</h2>
      {sub && <p className="mt-1 text-[13.5px] text-gray-600">{sub}</p>}
    </div>
  );
}

function MoneyStat({ label, value, sub }: { label: string; value: number | null; sub: string }) {
  return (
    <div className="rounded-[14px] bg-panel p-4">
      <p className="text-[13.5px] text-gray-600">{label}</p>
      <p className="mt-2 text-[28px] font-semibold leading-none tracking-[-0.035em]">
        {value != null && value > 0 ? <CountUp value={value} decimals={2} suffix=" €" /> : '–'}
      </p>
      <p className="mt-1.5 text-xs text-gray-600">{sub}</p>
    </div>
  );
}

/* ── Main View ───────────────────────────────────────────── */

interface DashboardViewProps {
  data: DashboardData;
  agencyId: string;
  agencyName: string;
  pendingSurveys?: number;
  /** Termine, Einstellungen, Umsatz der Neuen und ROI auf einen Blick */
  kennzahlen?: KundenKennzahlenDaten | null;
}

export function DashboardView({ data, agencyId, agencyName, pendingSurveys = 0, kennzahlen = null }: DashboardViewProps) {
  const now = new Date();
  const dayName = now.toLocaleDateString('de-DE', { weekday: 'long' });
  const kw = getISOWeek(now);
  const hireRate = data.totalCandidates > 0 ? Math.round((data.hired / data.totalCandidates) * 100) : 0;

  return (
    <div className="space-y-6">

      {/* ── Pending Survey Banner ─────────────────────────── */}
      {pendingSurveys > 0 && (
        <a
          href="/reports"
          className="flex items-center justify-between gap-4 rounded-xl border border-yellow-300 bg-yellow-50 px-5 py-4 text-yellow-900 hover:bg-yellow-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">📋</span>
            <div>
              <p className="text-sm font-semibold leading-tight">
                Du hast {pendingSurveys === 1 ? 'einen' : pendingSurveys} offene{pendingSurveys === 1 ? 'n' : ''} Feedback-Check{pendingSurveys > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-yellow-700 mt-0.5">
                Dein Feedback hilft uns, deine Kampagne zu verbessern.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold shrink-0 underline underline-offset-2">
            Jetzt ausfüllen →
          </span>
        </a>
      )}

      {/* ── Page Header ──────────────────────────────────── */}
      <div className="mb-[10px]">
        <span className="fx-fade mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-red-700" style={{ '--d': '0ms' } as React.CSSProperties}>
          {dayName} · KW {kw}
        </span>
        <SplitText as="h1" text="Dashboard" className="text-[clamp(30px,3vw,40px)] font-semibold leading-[1.1] tracking-[-0.035em]" />
        <p className="fx-fade mt-2 text-[15px] text-gray-600">Dein Recruiting bei {agencyName} – alles an einem ruhigen Ort.</p>
      </div>

      {/* ── Fahrplan bis zum Kampagnenstart (nur vor dem Start) ── */}
      <Fahrplan />

      {/* ── Auf Kurs? Stand der letzten 7 Tage ── */}
      <Wochenstand />

      {/* ── Auf einen Blick: Termine, Einstellungen, Umsatz, ROI ── */}
      {kennzahlen && <KundenKennzahlen d={kennzahlen} />}

      {/* ── SLA Ampel ────────────────────────────────────── */}
      <SlaAmpel agencyId={agencyId} />

      {/* ── Access Items ────────────────────────────────── */}
      <AccessItemsView agencyId={agencyId} />

      {/* ── KPI Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard hero title="Bewerber" value={data.totalCandidates} note="insgesamt" href="/candidates" />
        <StatCard title="Neu diese Woche" value={data.newThisWeek} note={`in KW ${kw}`} href="/candidates" />
        <StatCard title="Eingestellt" value={data.hired} note="insgesamt" />
        <StatCard title="Hire Rate" value={hireRate} suffix="%" note="Bewerber → Einstellung" href="/statistiken" />
      </div>

      {/* ── Werbekosten ──────────────────────────────────── */}
      {((data.metaDailyBudget != null && data.metaDailyBudget > 0) || (data.indeedDailyBudget != null && data.indeedDailyBudget > 0)) && (
        <DashCard>
          <CardTitle sub="Tagesbudget hochgerechnet auf 30 Tage">Werbekosten</CardTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.metaDailyBudget != null && data.metaDailyBudget > 0 && (() => {
              const daily = data.metaDailyBudget!;
              const monthly = daily * 30;
              const metaCandidates = data.sourceBreakdown.find((s) => s.name === 'Meta Ads')?.count ?? 0;
              const cpl = metaCandidates > 0 ? monthly / metaCandidates : 0;
              return (
                <>
                  <MoneyStat label="Meta Tagesbudget" value={daily} sub={`${monthly.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € / Monat`} />
                  <MoneyStat label="Meta Kosten pro Bewerber" value={cpl} sub={`${metaCandidates} Bewerber`} />
                </>
              );
            })()}
            {data.indeedDailyBudget != null && data.indeedDailyBudget > 0 && (() => {
              const daily = data.indeedDailyBudget!;
              const monthly = daily * 30;
              const indeedCandidates = data.sourceBreakdown.find((s) => s.name === 'Indeed')?.count ?? 0;
              const cpl = indeedCandidates > 0 ? monthly / indeedCandidates : 0;
              return (
                <>
                  <MoneyStat label="Indeed Tagesbudget" value={daily} sub={`${monthly.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € / Monat`} />
                  <MoneyStat label="Indeed Kosten pro Bewerber" value={cpl} sub={`${indeedCandidates} Bewerber`} />
                </>
              );
            })()}
          </div>
        </DashCard>
      )}

      {/* ── Row 2: Chart + Quellen ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <DashCard className="lg:col-span-3">
          <CardTitle>Bewerber-Entwicklung</CardTitle>
          <CandidatesChart data={data.candidatesOverTime} />
        </DashCard>

        <DashCard className="lg:col-span-2">
          <CardTitle>Quellen-Verteilung</CardTitle>
          <SourceDonut data={data.sourceBreakdown} />
        </DashCard>
      </div>

      {/* ── Row 3: Pipeline + Source Bar ──────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DashCard>
          <CardTitle>Bewerber nach Phase</CardTitle>
          <PipelineChart data={data.stageBreakdown} />
        </DashCard>

        <DashCard>
          <CardTitle>Bewerber nach Quelle</CardTitle>
          <SourcesChart data={data.sourceBreakdown} />
        </DashCard>
      </div>

      {/* ── Row 4: Recent Candidates ─────────────────────── */}
      <DashCard>
        <CardTitle>Neue Bewerber</CardTitle>

        {data.recentCandidates.length === 0 ? (
          <p className="text-sm text-gray-500">Noch keine Bewerber</p>
        ) : (
          <div className="-mx-2 space-y-1">
            {data.recentCandidates.map((c) => (
              <a
                key={c.id}
                href={`/candidates/${c.id}`}
                className="flex items-center gap-3.5 rounded-[14px] px-2 py-2 transition-colors hover:bg-panel"
              >
                <Avatar name={c.name} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{c.name}</span>
                <Badge tone={c.source === 'meta' ? 'softAccent' : c.source === 'indeed' ? 'neutral' : 'outline'}>
                  {SOURCE_LABELS[c.source] || c.source}
                </Badge>
                <span className="hidden w-24 shrink-0 text-right text-xs text-gray-500 sm:block">
                  {timeAgo(c.created_at)}
                </span>
              </a>
            ))}
          </div>
        )}
      </DashCard>

      {/* ── Project Overview ───────────────────────────── */}
      <ProjectOverview agencyId={agencyId} />

      {/* ── Masterclass Progress ─────────────────────────── */}
      <MasterclassProgress agencyId={agencyId} />
    </div>
  );
}
