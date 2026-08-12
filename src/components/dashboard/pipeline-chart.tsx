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

interface PipelineChartProps {
  data: { name: string; count: number; color: string }[];
}

const FALLBACK_COLORS = [
  '#E0354B', '#EA6A7C', '#E8A13C', '#2FBF71', '#41454C', '#8B919B', '#AEB4BD',
];

export function PipelineChart({ data }: PipelineChartProps) {
  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#8B919B' }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#8B919B' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={32}
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
          <Bar dataKey="count" name="Bewerber" radius={[4, 4, 0, 0]} barSize={28}>
            {data.map((entry, i) => (
              <Cell
                key={entry.name}
                fill={entry.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
