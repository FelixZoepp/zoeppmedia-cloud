'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { CountUp } from '@/components/ui/motion';

// Fernly-Donut: dunkel → mittel → hell, dazu Amber und Grau
const DONUT_COLORS = ['#3b0b09', '#a3201a', '#e6716a', '#e8a317', '#a69f9b'];

interface SourceDonutProps {
  data: { name: string; count: number }[];
}

export function SourceDonut({ data }: SourceDonutProps) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={total > 0 ? data : [{ name: 'leer', count: 1 }]}
              dataKey="count"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={88}
              paddingAngle={total > 0 ? 2 : 0}
              strokeWidth={0}
              startAngle={90}
              endAngle={-270}
              animationDuration={1100}
              animationEasing="ease-out"
            >
              {(total > 0 ? data : [{ name: 'leer', count: 1 }]).map((_, i) => (
                <Cell key={i} fill={total > 0 ? DONUT_COLORS[i % DONUT_COLORS.length] : '#e6e3e1'} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="text-[30px] font-semibold leading-none tracking-[-0.04em]">
            <CountUp value={total} />
          </span>
          <span className="mt-1 text-xs text-gray-600">Bewerber</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-2.5">
        {data.map((item, i) => {
          const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
          return (
            <li key={item.name} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                <span className="truncate text-[14px]">{item.name}</span>
              </span>
              <span className="text-[14px] font-semibold tabular-nums">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
