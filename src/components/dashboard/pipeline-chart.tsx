'use client';

import { useState } from 'react';

interface PipelineChartProps {
  data: { name: string; count: number; color: string }[];
}

// Fernly-Säulen: mittel, hell, dunkel im Wechsel – leere Phasen schraffiert
const PILL_COLORS = ['#a3201a', '#e6716a', '#3b0b09'];

export function PipelineChart({ data }: PipelineChartProps) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const peak = data.reduce((best, d, i) => (d.count > (data[best]?.count ?? -1) ? i : best), 0);
  const [active, setActive] = useState<number | null>(null);
  const shown = active ?? (data[peak]?.count ? peak : null);

  if (data.length === 0) {
    return <p className="text-sm text-gray-500">Noch keine Phasen angelegt</p>;
  }

  return (
    <ul
      className="grid min-h-[210px] gap-[clamp(8px,1.4vw,16px)]"
      style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
      onMouseLeave={() => setActive(null)}
    >
      {data.map((d, i) => {
        const h = d.count > 0 ? Math.max(0.22, d.count / max) : 0.55;
        return (
          <li key={d.name} className="grid min-w-0 grid-rows-[1fr_auto] gap-2.5">
            <button
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${d.name}: ${d.count} Bewerber`}
              className="relative w-full self-end rounded-full"
              style={{ height: `${h * 100}%`, minHeight: 40 }}
            >
              <span
                className={`absolute inset-0 origin-bottom rounded-full transition-[filter] hover:brightness-110 ${d.count === 0 ? 'fx-hatch' : ''}`}
                style={{
                  background: d.count === 0 ? undefined : PILL_COLORS[i % PILL_COLORS.length],
                  animation: `fx-grow .9s cubic-bezier(.33,1,.68,1) ${150 + i * 60}ms both`,
                }}
              />
              {shown === i && (
                <span className="pointer-events-none absolute -top-9 left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-[7px] bg-card px-2 py-[3px] text-[11px] font-semibold shadow-[0_0_0_1px_var(--hair),0_6px_16px_-8px_#1a151459]">
                  {d.count}
                  <span className="absolute left-1/2 top-full h-2.5 w-px -translate-x-1/2 bg-gray-400" />
                </span>
              )}
            </button>
            <span className="truncate text-center text-[13px] text-gray-600" title={d.name}>
              {d.name}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
