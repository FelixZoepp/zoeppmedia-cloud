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
  'Meta Ads': '#E0354B',
  Indeed: '#41454C',
  Manuell: '#AEB4BD',
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
            tick={{ fontSize: 12, fill: '#8B919B' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fontSize: 13, fill: '#41454C', fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip
            contentStyle={{
              background: '#fff',
              border: '1px solid #E7E9ED',
              borderRadius: '10px',
              boxShadow: '0 4px 12px rgba(23,24,26,0.08)',
              fontSize: '13px',
              padding: '6px 10px',
            }}
          />
          <Bar dataKey="count" name="Bewerber" radius={[0, 4, 4, 0]} barSize={20}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={SOURCE_COLORS[entry.name] || '#D6DAE0'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
