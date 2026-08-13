'use client';

import type { DashboardData } from '@/lib/dashboard';
import { Users, UserPlus, UserCheck } from 'lucide-react';
import type { ReactNode } from 'react';

function calcChange(current: number, previous: number): string | null {
  if (previous === 0) return current > 0 ? '+100%' : null;
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

interface KpiCardProps {
  label: string;
  value: number;
  change: string | null;
  icon: ReactNode;
  accent?: boolean;
}

function KpiCard({ label, value, change, icon, accent }: KpiCardProps) {
  const isPositive = change && change.startsWith('+');

  return (
    <div
      className={`rounded-xl p-6 shadow-sm ${
        accent
          ? 'bg-red-600 text-white'
          : 'bg-white'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className={`text-xs font-medium ${
            accent ? 'text-white/80' : 'text-gray-600'
          }`}
        >
          {label}
        </span>
        <span className={accent ? 'text-white/60' : 'text-gray-400'}>
          {icon}
        </span>
      </div>
      <div className="flex items-end gap-3">
        <span
          className={`text-3xl font-extrabold leading-none tracking-tight ${
            accent ? 'text-white' : 'text-gray-900'
          }`}
        >
          {value}
        </span>
        {change && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full mb-1 ${
              accent
                ? 'bg-white/20 text-white'
                : isPositive
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-50 text-red-600'
            }`}
          >
            {change}
          </span>
        )}
      </div>
    </div>
  );
}

interface KpiCardsProps {
  data: DashboardData;
}

export function KpiCards({ data }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <KpiCard
        label="Bewerber"
        value={data.totalCandidates}
        change={calcChange(data.totalCandidates, data.totalPrevWeek)}
        icon={<Users className="w-5 h-5" />}
        accent
      />
      <KpiCard
        label="Neu diese Woche"
        value={data.newThisWeek}
        change={calcChange(data.newThisWeek, data.newPrevWeek)}
        icon={<UserPlus className="w-5 h-5" />}
      />
      <KpiCard
        label="Eingestellt"
        value={data.hired}
        change={calcChange(data.hired, data.hiredPrevWeek)}
        icon={<UserCheck className="w-5 h-5" />}
      />
    </div>
  );
}
