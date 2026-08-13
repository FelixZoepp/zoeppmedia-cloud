'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const DONUT_COLORS = ['#E0354B', '#41454C', '#AEB4BD', '#EA6A7C'];

interface SourceDonutProps {
  data: { name: string; count: number }[];
}

export function SourceDonut({ data }: SourceDonutProps) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="flex items-center gap-6 h-[200px]">
      <div className="w-[140px] h-[140px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={64}
              paddingAngle={3}
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-3 flex-1">
        {data.map((item, i) => {
          const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0';
          return (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                />
                <span className="text-xs text-gray-900">{item.name}</span>
              </div>
              <span className="text-xs font-semibold text-gray-600 tabular-nums">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
