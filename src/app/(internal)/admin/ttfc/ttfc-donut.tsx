'use client';

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';

// Eigene Datei, damit recharts per next/dynamic erst bei Bedarf geladen wird

/* ------------------------------------------------------------------ */
/*  Custom Tooltip                                                     */
/* ------------------------------------------------------------------ */

interface TooltipPayloadEntry {
  name: string;
  value: number;
  payload: { name: string; value: number; pct: string };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadEntry[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-lg text-sm">
      <p className="font-medium text-gray-900">{entry.payload.name}</p>
      <p className="text-gray-500">{entry.value} ({entry.payload.pct})</p>
    </div>
  );
}

export function TtfcDonut({
  donutData,
  colors: DONUT_COLORS,
}: {
  donutData: { name: string; value: number; pct: string }[];
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={donutData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={3}
          dataKey="value"
          stroke="none"
        >
          {donutData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={DONUT_COLORS[index]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
