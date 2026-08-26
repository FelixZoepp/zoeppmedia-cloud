'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react';

interface SlaData {
  medianTtfcSeconds: number | null;
  withinSlaPercent: number;
  slaHours: number;
  streak: number;
  previousWithinSlaPercent: number | null;
  totalCandidates: number;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours} Std ${minutes} Min` : `${hours} Std`;
  }
  return `${minutes} Min`;
}

function getTrafficLightColor(percent: number): 'green' | 'yellow' | 'red' {
  if (percent >= 80) return 'green';
  if (percent >= 50) return 'yellow';
  return 'red';
}

const colorClasses = {
  green: {
    bg: 'bg-green-500',
    ring: 'ring-green-200',
    text: 'text-green-700',
    lightBg: 'bg-green-50',
    border: 'border-green-200',
  },
  yellow: {
    bg: 'bg-yellow-400',
    ring: 'ring-yellow-200',
    text: 'text-yellow-700',
    lightBg: 'bg-yellow-50',
    border: 'border-yellow-200',
  },
  red: {
    bg: 'bg-red-500',
    ring: 'ring-red-200',
    text: 'text-red-700',
    lightBg: 'bg-red-50',
    border: 'border-red-200',
  },
};

export function SlaAmpel({ agencyId }: { agencyId: string }) {
  const [data, setData] = useState<SlaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/dashboard/sla?agencyId=${agencyId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [agencyId]);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm animate-pulse">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-gray-100" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-gray-100 rounded w-40" />
            <div className="h-8 bg-gray-100 rounded w-32" />
            <div className="h-3 bg-gray-100 rounded w-56" />
          </div>
        </div>
      </div>
    );
  }

  // No candidates state
  if (!data || data.totalCandidates === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-gray-100 ring-4 ring-gray-100 flex items-center justify-center">
            <Clock className="w-8 h-8 text-gray-300" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1">
              Deine Erstkontaktzeit
            </span>
            <span className="text-xl font-bold text-gray-400 block">
              Noch keine Bewerber
            </span>
            <span className="text-sm text-gray-400 mt-1 block">
              Sobald Bewerber eingehen, siehst du hier deine Reaktionszeit.
            </span>
          </div>
        </div>
      </div>
    );
  }

  const color = getTrafficLightColor(data.withinSlaPercent);
  const classes = colorClasses[color];

  // Trend calculation
  let trend: 'up' | 'down' | 'neutral' = 'neutral';
  if (data.previousWithinSlaPercent !== null) {
    const diff = data.withinSlaPercent - data.previousWithinSlaPercent;
    if (diff > 3) trend = 'up';
    else if (diff < -3) trend = 'down';
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-6">
        {/* Traffic light circle */}
        <div
          className={`w-20 h-20 rounded-full ${classes.bg} ring-4 ${classes.ring} flex items-center justify-center shrink-0`}
        >
          <span className="text-2xl font-extrabold text-white">
            {data.withinSlaPercent}%
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-red-600">
              Deine Erstkontaktzeit
            </span>
            {trend !== 'neutral' && (
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  trend === 'up'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                {trend === 'up' ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {trend === 'up' ? 'Besser' : 'Schlechter'}
              </span>
            )}
          </div>

          <span className="text-3xl font-extrabold text-gray-900 leading-none tracking-tight block">
            {data.medianTtfcSeconds !== null
              ? formatDuration(data.medianTtfcSeconds)
              : '–'}
          </span>

          <span className="text-sm text-gray-500 mt-1.5 block">
            {data.withinSlaPercent}% deiner Bewerber werden innerhalb von{' '}
            {data.slaHours} Stunden kontaktiert
          </span>
        </div>
      </div>

      {/* Red zone tip */}
      {color === 'red' && (
        <div className={`mt-4 px-4 py-3 rounded-lg ${classes.lightBg} border ${classes.border}`}>
          <p className={`text-sm ${classes.text}`}>
            Tipp: Bewerber innerhalb der ersten Stunde anrufen verdreifacht die
            Erreichquote.
          </p>
        </div>
      )}
    </div>
  );
}
