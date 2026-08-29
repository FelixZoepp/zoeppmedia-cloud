'use client';

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingDown } from 'lucide-react';

interface FunnelStep {
  key: string;
  label: string;
  placeholder: number;
}

const STEPS: FunnelStep[] = [
  { key: 'bewerbungen', label: 'Bewerbungen', placeholder: 100 },
  { key: 'erreicht', label: 'Erreicht', placeholder: 60 },
  { key: 'qualifiziert', label: 'Qualifiziert', placeholder: 40 },
  { key: 'vg_eingeladen', label: 'VG eingeladen', placeholder: 30 },
  { key: 'vg_erschienen', label: 'VG erschienen', placeholder: 20 },
  { key: 'probetag', label: 'Probetag', placeholder: 12 },
  { key: 'probetag_erschienen', label: 'Probetag erschienen', placeholder: 8 },
  { key: 'einstellung', label: 'Einstellung', placeholder: 4 },
];

function rateColor(rate: number): string {
  if (rate < 50) return 'text-red-600';
  if (rate < 70) return 'text-amber-600';
  return 'text-green-600';
}

function barColor(rate: number): string {
  if (rate < 50) return 'bg-red-500';
  if (rate < 70) return 'bg-amber-500';
  return 'bg-green-500';
}

function rateBadgeTone(rate: number): 'accent' | 'neutral' | 'success' {
  if (rate < 50) return 'accent';
  if (rate < 70) return 'neutral';
  return 'success';
}

export function RecruitingFunnel() {
  const [values, setValues] = useState<Record<string, string>>({});

  const update = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const numericValues = useMemo(() => {
    return STEPS.map((step) => {
      const raw = values[step.key];
      return raw ? parseInt(raw, 10) || 0 : 0;
    });
  }, [values]);

  const rates = useMemo(() => {
    return STEPS.map((_, i) => {
      if (i === 0) return 100;
      const prev = numericValues[i - 1];
      const curr = numericValues[i];
      if (prev === 0) return 0;
      return Math.round((curr / prev) * 100);
    });
  }, [numericValues]);

  const overallRate = numericValues[0] > 0
    ? ((numericValues[numericValues.length - 1] / numericValues[0]) * 100).toFixed(1)
    : '0.0';

  const maxVal = Math.max(...numericValues, 1);

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-600" />
            Recruiting-Funnel Rechner
          </h3>
          <p className="text-sm text-gray-500 mt-1">Trage deine Zahlen ein und sieh sofort, wo dein Funnel leckt</p>
        </div>
        {numericValues[0] > 0 && (
          <Badge tone={parseFloat(overallRate) < 3 ? 'accent' : parseFloat(overallRate) < 5 ? 'neutral' : 'success'}>
            Gesamt: {overallRate}%
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {STEPS.map((step) => (
          <div key={step.key}>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">{step.label}</label>
            <input
              type="number"
              min="0"
              placeholder={String(step.placeholder)}
              value={values[step.key] ?? ''}
              onChange={(e) => update(step.key, e.target.value)}
              className="w-full h-10 bg-white border border-gray-300 rounded-lg px-3 text-sm text-gray-900 shadow-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
        ))}
      </div>

      {numericValues[0] > 0 && (
        <>
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Conversion-Raten</h4>
          <div className="space-y-3">
            {STEPS.map((step, i) => {
              if (i === 0) return null;
              const rate = rates[i];
              return (
                <div key={step.key} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-44 flex-shrink-0 truncate">
                    {STEPS[i - 1].label} &rarr; {step.label}
                  </span>
                  <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all ${barColor(rate)}`}
                      style={{ width: `${Math.min(rate, 100)}%` }}
                    />
                  </div>
                  <span className={`text-sm font-bold w-14 text-right ${rateColor(rate)}`}>
                    {rate}%
                  </span>
                  <Badge tone={rateBadgeTone(rate)} className="w-16 justify-center text-[10px]">
                    {rate < 50 ? 'Kritisch' : rate < 70 ? 'OK' : 'Gut'}
                  </Badge>
                </div>
              );
            })}
          </div>

          <div className="mt-8">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">Visueller Funnel</h4>
            <div className="space-y-1.5">
              {STEPS.map((step, i) => {
                const val = numericValues[i];
                const width = maxVal > 0 ? (val / maxVal) * 100 : 0;
                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-36 flex-shrink-0 truncate text-right">{step.label}</span>
                    <div className="flex-1 flex items-center">
                      <div
                        className="h-8 bg-red-100 rounded-lg flex items-center px-3 transition-all"
                        style={{ width: `${Math.max(width, 4)}%` }}
                      >
                        <span className="text-xs font-bold text-red-700">{val}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
