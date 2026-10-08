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

// Eigene Datei, damit recharts per next/dynamic erst bei Bedarf geladen wird
export function TimelineChart({
  timelineFlat,
  allSources,
  sourceColor,
}: {
  timelineFlat: Record<string, string | number>[];
  allSources: string[];
  sourceColor: (src: string) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={timelineFlat} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          {allSources.map((src) => (
            <linearGradient key={src} id={`grad-${src}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={sourceColor(src)} stopOpacity={0.15} />
              <stop offset="95%" stopColor={sourceColor(src)} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#efedeb" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: '#7a726e' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#7a726e' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={28}
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
        {allSources.map((src) => (
          <Area
            key={src}
            type="monotone"
            dataKey={src}
            name={src}
            stackId="1"
            stroke={sourceColor(src)}
            strokeWidth={2}
            fill={`url(#grad-${src})`}
            dot={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
