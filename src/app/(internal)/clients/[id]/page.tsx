'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Users, UserCheck, TrendingUp, Calendar, AlertTriangle } from 'lucide-react';
import type { Agency } from '@/lib/types/database';

type AgencyDetail = {
  agency: Agency;
  totalCandidates: number;
  hired: number;
  hireRate: number;
  funnel: { stage: string; color: string; count: number }[];
  sourceBreakdown: { meta: number; indeed: number; manual: number };
  lastLogin: string | null;
  recentCandidates: number;
  upsellSignals: string[];
};

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AgencyDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/agencies/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card padding="lg" className="text-center">
        <p className="text-[var(--text-secondary)]">Agentur nicht gefunden.</p>
      </Card>
    );
  }

  const { agency, totalCandidates, hired, hireRate, funnel, sourceBreakdown, lastLogin, recentCandidates, upsellSignals } = data;

  const kpis = [
    {
      label: 'Bewerber gesamt',
      value: totalCandidates,
      icon: <Users size={20} />,
      accent: false,
    },
    {
      label: 'Eingestellt',
      value: hired,
      icon: <UserCheck size={20} />,
      accent: true,
    },
    {
      label: 'Einstellungsquote',
      value: `${hireRate}%`,
      icon: <TrendingUp size={20} />,
      accent: false,
    },
    {
      label: 'Letzte 30 Tage',
      value: recentCandidates,
      icon: <Calendar size={20} />,
      accent: false,
    },
  ];

  // Apple Red funnel colors
  const funnelColors = [
    'var(--red-500)',
    'var(--red-400)',
    'var(--red-300)',
    'var(--red-200)',
    'var(--red-100)',
    'var(--gray-300)',
  ];

  return (
    <div>
      {/* Back link + header */}
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-[var(--text-sm)] text-[var(--text-secondary)] hover:text-red-500 transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Zuruck zur Ubersicht
      </Link>

      <div className="mb-8">
        <h1 className="text-[var(--text-h2)] font-extrabold text-[var(--text-primary)] tracking-[var(--tracking-heading)] leading-[var(--leading-heading)]">
          {agency.name}
        </h1>
        <p className="text-[var(--text-body)] text-[var(--text-secondary)] mt-1">
          {agency.contact_name} &middot; {agency.email}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map((kpi) => (
          <Card key={kpi.label} padding="md">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center ${
                kpi.accent ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-500'
              }`}>
                {kpi.icon}
              </div>
              <span className="text-[var(--text-sm)] text-[var(--text-secondary)] font-medium">
                {kpi.label}
              </span>
            </div>
            <p className={`text-3xl font-extrabold tracking-[var(--tracking-heading)] ${
              kpi.accent ? 'text-green-700' : 'text-[var(--text-primary)]'
            }`}>
              {kpi.value}
            </p>
          </Card>
        ))}
      </div>

      {/* Funnel */}
      <Card padding="lg" className="mb-6">
        <h2 className="text-[var(--text-sm)] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-5">
          Conversion Funnel
        </h2>
        <div className="space-y-3">
          {funnel?.map((f, index) => {
            const maxCount = Math.max(...(funnel?.map((x) => x.count) || [1]), 1);
            const width = Math.max((f.count / maxCount) * 100, 4);
            const barColor = funnelColors[index] || funnelColors[funnelColors.length - 1];
            return (
              <div key={f.stage} className="flex items-center gap-4">
                <span className="text-[var(--text-sm)] text-[var(--text-secondary)] w-44 flex-shrink-0 font-medium">
                  {f.stage}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center px-3 transition-all duration-500"
                    style={{ width: `${width}%`, backgroundColor: barColor }}
                  >
                    <span className="text-[var(--text-sm)] font-semibold text-white drop-shadow-sm">
                      {f.count}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Source Breakdown */}
      <Card padding="lg" className="mb-6">
        <h2 className="text-[var(--text-sm)] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-5">
          Quellen
        </h2>
        <div className="grid grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-red-50 flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl font-extrabold text-red-500">{sourceBreakdown.meta}</span>
            </div>
            <p className="text-[var(--text-sm)] text-[var(--text-secondary)] font-medium">Meta</p>
          </div>
          <div className="text-center">
            <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-red-50 flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl font-extrabold text-red-500">{sourceBreakdown.indeed}</span>
            </div>
            <p className="text-[var(--text-sm)] text-[var(--text-secondary)] font-medium">Indeed</p>
          </div>
          <div className="text-center">
            <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-gray-100 flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl font-extrabold text-[var(--text-primary)]">{sourceBreakdown.manual}</span>
            </div>
            <p className="text-[var(--text-sm)] text-[var(--text-secondary)] font-medium">Manuell</p>
          </div>
        </div>
      </Card>

      {/* Activity */}
      <Card padding="lg" className="mb-6">
        <h2 className="text-[var(--text-sm)] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-4">
          Aktivitat
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-[var(--text-secondary)] text-[var(--text-sm)]">Letzter Login:</span>
          {lastLogin ? (
            <Badge tone="success">
              {new Date(lastLogin).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Badge>
          ) : (
            <Badge tone="outline">Nie</Badge>
          )}
        </div>
      </Card>

      {/* Upsell Signals */}
      {upsellSignals.length > 0 && (
        <Card padding="lg" className="!bg-amber-100/50 border border-amber-500/20">
          <h2 className="text-[var(--text-sm)] font-semibold text-amber-500 uppercase tracking-wide mb-4 flex items-center gap-2">
            <AlertTriangle size={16} />
            Upsell-Signale
          </h2>
          <div className="space-y-2.5">
            {upsellSignals.map((signal, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 text-[var(--text-sm)]"
              >
                <Badge tone="softAccent" className="flex-shrink-0 mt-0.5">
                  !
                </Badge>
                <span className="text-amber-500 font-medium">{signal}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
