'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface CandidatesChartProps {
  data: { month: string; count: number }[];
}

export function CandidatesChart({ data }: CandidatesChartProps) {
  return (
    <div className="h-[200px] -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="colorBewerber" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a3201a" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#a3201a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#efedeb" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: '#7a726e' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#7a726e' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: '#fdfcfb',
              border: 'none',
              borderRadius: '10px',
              boxShadow: '0 0 0 1px #e6e3e1, 0 10px 24px -10px rgba(26,21,20,0.35)',
              fontSize: '13px',
              padding: '6px 10px',
            }}
            labelStyle={{ fontWeight: 600, marginBottom: 2 }}
          />
          <Area
            type="monotone"
            dataKey="count"
            name="Bewerber"
            stroke="#a3201a"
            strokeWidth={2}
            fill="url(#colorBewerber)"
            dot={{ r: 3, fill: '#a3201a', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#a3201a', strokeWidth: 2, stroke: '#fff' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
