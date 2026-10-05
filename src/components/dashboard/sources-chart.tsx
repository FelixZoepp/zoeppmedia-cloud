'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const SOURCE_COLORS: Record<string, string> = {
  'Meta Ads': '#a3201a',
  Indeed: '#3b0b09',
  Manuell: '#a69f9b',
};

interface SourcesChartProps {
  data: { name: string; count: number }[];
}

export function SourcesChart({ data }: SourcesChartProps) {
  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: '#7a726e' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fontSize: 13, fill: '#3b0b09', fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            width={72}
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
          />
          <Bar dataKey="count" name="Bewerber" radius={[0, 4, 4, 0]} barSize={20}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={SOURCE_COLORS[entry.name] || '#d5d0cd'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
