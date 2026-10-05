'use client';

import type { AdminDashboardData } from '@/lib/admin-dashboard';
import { CandidatesChart } from './candidates-chart';
import { SourcesChart } from './sources-chart';
import { SourceDonut } from './source-donut';
import { Users, Target, Plus, Building2, BookOpen, ArrowUpRight } from 'lucide-react';
import { Avatar, Badge, Card, CardHead, SplitText, StatCard, buttonStyles } from '@/components/ui';
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
  const dayName = now.toLocaleDateString('de-DE', { weekday: 'long' });
  const kw = getISOWeek(now);
  const hireRate = data.totalCandidates > 0 ? Math.round((data.totalHired / data.totalCandidates) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Kopf */}
      <div className="mb-[26px] flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <span className="fx-fade mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-red-700" style={{ '--d': '0ms' } as React.CSSProperties}>
            {dayName} · KW {kw}
          </span>
          <SplitText
            as="h1"
            text={`${getGreeting()}, Felix.`}
            className="text-[clamp(30px,3vw,40px)] font-semibold leading-[1.1] tracking-[-0.035em]"
          />
          <p className="fx-fade mt-2 text-[15px] text-gray-600">Alles, was bei deinen Kunden gerade läuft – an einem ruhigen Ort.</p>
        </div>
        <div className="fx-fade flex flex-wrap gap-3" style={{ '--d': '130ms' } as React.CSSProperties}>
          <Link href="/invites" className={buttonStyles('primary', 'xl')}>
            <Plus /> Neue Agentur
          </Link>
          <Link href="/clients" className={buttonStyles('secondary', 'xl')}>
            <Users /> Alle Kunden
          </Link>
        </div>
      </div>

      {/* Kennzahlen */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard hero title="Agenturen" value={data.totalAgencies} trend={pct(data.totalAgencies, data.agenciesPrevWeek)} trendLabel="ggü. Vorwoche" href="/clients" />
        <StatCard title="Bewerber" value={data.totalCandidates} trend={pct(data.totalCandidates, data.candidatesPrevWeek)} trendLabel="ggü. Vorwoche" href="/admin/recruiting" />
        <StatCard title="Neu diese Woche" value={data.newCandidatesThisWeek} trend={pct(data.newCandidatesThisWeek, data.newCandidatesPrevWeek)} trendLabel="ggü. Vorwoche" href="/admin/recruiting" />
        <StatCard title="Eingestellt" value={data.totalHired} note={`${hireRate}% Hire Rate`} />
      </div>

      {/* Entwicklung, Quellen, Schnellzugriff */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card className="xl:col-span-2">
          <CardHead title="Bewerber-Entwicklung" />
          <p className="mt-1 text-[13.5px] text-gray-600">Neue Bewerber pro Monat, alle Kunden</p>
          <div className="mt-5">
            <CandidatesChart data={data.candidatesOverTime} />
          </div>
        </Card>
        <Card>
          <CardHead title="Quellen" />
          <div className="mt-5">
            <SourceDonut data={data.sourceBreakdown} />
          </div>
        </Card>
        <Card>
          <CardHead title="Schnellzugriff" />
          <ul className="mt-4 space-y-1">
            <QuickAction icon={<Plus className="h-[18px] w-[18px]" />} title="Neue Agentur" desc="Kunden einladen" href="/invites" />
            <QuickAction icon={<Building2 className="h-[18px] w-[18px]" />} title="Kunden" desc="Alle Agenturen" href="/clients" />
            <QuickAction icon={<BookOpen className="h-[18px] w-[18px]" />} title="Playbook" desc="Handlungsanweisungen" href="/playbook" />
            <QuickAction icon={<Target className="h-[18px] w-[18px]" />} title="KPI-Ziele" desc="Zielwerte verwalten" href="/admin/kpi" />
            <QuickAction icon={<Users className="h-[18px] w-[18px]" />} title="Team" desc="Mitarbeiter verwalten" href="/team" />
          </ul>
        </Card>
      </div>

      {/* Letzte Bewerber + Kanäle */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHead title="Neue Bewerber" />
          {data.recentCandidates.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">Noch keine Bewerber</p>
          ) : (
            <ul className="mt-4 space-y-3.5">
              {data.recentCandidates.map((c) => (
                <li key={c.id} className="flex items-center gap-3.5">
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{c.name}</p>
                    <p className="truncate text-[13px] text-gray-600">
                      bei <span className="font-medium text-ink">{c.agency_name}</span>
                    </p>
                  </div>
                  <Badge tone={c.source === 'meta' ? 'softAccent' : c.source === 'indeed' ? 'neutral' : 'outline'}>
                    {SOURCE_LABELS[c.source] || c.source}
                  </Badge>
                  <span className="hidden w-20 shrink-0 text-right text-xs text-gray-500 sm:block">{timeAgo(c.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardHead title="Bewerber nach Quelle" />
          <div className="mt-5">
            <SourcesChart data={data.sourceBreakdown} />
          </div>
        </Card>
      </div>

      {/* Agenturen */}
      <Card>
        <CardHead
          title="Agenturen"
          action={
            <Link href="/clients" className={buttonStyles('secondary', 'sm')}>
              Alle Kunden <ArrowUpRight />
            </Link>
          }
        />
        {data.topAgencies.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">Noch keine Agenturen</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-4 w-full">
              <thead>
                <tr className="border-b border-hair">
                  <th className="pb-3 text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Agentur</th>
                  <th className="pb-3 text-right text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Bewerber</th>
                  <th className="pb-3 text-right text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Eingestellt</th>
                  <th className="pb-3 text-right text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Hire Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.topAgencies.map((agency) => {
                  const rate = agency.candidates > 0 ? Math.round((agency.hired / agency.candidates) * 100) : 0;
                  return (
                    <tr key={agency.id} className="border-b border-hair last:border-0">
                      <td className="py-3">
                        <Link href={`/clients/${agency.id}`} className="flex items-center gap-3 hover:opacity-80">
                          <Avatar name={agency.name} />
                          <span className="text-[15px] font-medium">{agency.name}</span>
                        </Link>
                      </td>
                      <td className="py-3 text-right text-[15px] font-semibold">{agency.candidates}</td>
                      <td className="py-3 text-right text-[15px] font-semibold">{agency.hired}</td>
                      <td className="py-3 text-right">
                        {rate > 0 ? <Badge tone="success">{rate}%</Badge> : <span className="text-sm text-gray-400">0%</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Status */}
      <Card>
        <CardHead
          title="Agentur-Status"
          action={
            data.totalProblems > 0 ? (
              <Badge tone="danger">
                <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                {data.totalProblems} Problem{data.totalProblems !== 1 ? 'e' : ''}
              </Badge>
            ) : undefined
          }
        />
        {data.agencyStatuses.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">Noch keine Agenturen</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-4 w-full">
              <thead>
                <tr className="border-b border-hair">
                  <th className="pb-3 text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Agentur</th>
                  <th className="pb-3 text-center text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Status</th>
                  <th className="pb-3 text-right text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Kritisch</th>
                  <th className="pb-3 text-right text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Warnung</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {data.agencyStatuses.map((a) => (
                  <tr key={a.id} className="border-b border-hair last:border-0">
                    <td className="py-3">
                      <Link href={`/clients/${a.id}`} className="flex items-center gap-3 hover:opacity-80">
                        <Avatar name={a.name} />
                        <span className="text-[15px] font-medium">{a.name}</span>
                      </Link>
                    </td>
                    <td className="py-3 text-center">
                      {a.status === 'red' ? (
                        <Badge tone="danger">Kritisch</Badge>
                      ) : a.status === 'yellow' ? (
                        <Badge tone="warning">Achtung</Badge>
                      ) : (
                        <Badge tone="success">Läuft</Badge>
                      )}
                    </td>
                    <td className="py-3 text-right text-[15px] font-semibold">
                      {a.criticalCount > 0 ? <span className="text-red-700">{a.criticalCount}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 text-right text-[15px] font-semibold">
                      {a.warningCount > 0 ? <span className="text-amber-700">{a.warningCount}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/clients/${a.id}`}
                        aria-label={`${a.name} öffnen`}
                        className="ml-auto grid h-[34px] w-[34px] place-items-center rounded-full text-ink shadow-[inset_0_0_0_1.5px_currentColor] transition-[transform,background,color] duration-300 ease-fern hover:rotate-45 hover:bg-ink hover:text-card hover:shadow-none"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function QuickAction({ icon, title, desc, href }: { icon: React.ReactNode; title: string; desc: string; href: string }) {
  return (
    <li>
      <Link href={href} className="group -mx-2 flex items-center gap-3.5 rounded-[14px] px-2 py-2 transition-colors hover:bg-panel">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-red-100 text-red-800 transition-colors group-hover:bg-red-950 group-hover:text-red-50">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{title}</span>
          <span className="block truncate text-[13px] text-gray-600">{desc}</span>
        </span>
      </Link>
    </li>
  );
}

/** Veränderung in % gegenüber dem Vorwert; ohne Vorwert kein Trend */
function pct(current: number, previous: number): number | undefined {
  if (!previous) return undefined;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
