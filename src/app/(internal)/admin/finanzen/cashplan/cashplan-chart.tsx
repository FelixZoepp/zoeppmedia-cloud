'use client';

import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CashMonat } from '@/lib/finanzen/cashplan';

// Eigene Datei, damit recharts per next/dynamic erst bei Bedarf geladen wird
export function CashplanChart({ daten, gewaehlt, onWahl }: { daten: Array<CashMonat & { ist?: number }>; gewaehlt: string; onWahl: (monat: string) => void }) {
  const eur = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;
  const monat = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
  const klick = (d: unknown) => {
    const m = (d as { payload?: { monat?: string } })?.payload?.monat;
    if (m) onWahl(m);
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={daten} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="monat" tickFormatter={monat} tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} width={40} />
        <Tooltip formatter={(v) => eur(Number(v))} labelFormatter={(m) => monat(String(m))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="monatlich" name="Monatsgebühren" stackId="c" onClick={klick} cursor="pointer">
          {daten.map((d) => (
            <Cell key={d.monat} fill={d.monat === gewaehlt ? '#7f1d1d' : '#b91c1c'} />
          ))}
        </Bar>
        <Bar dataKey="setup" name="Setup" stackId="c" radius={[4, 4, 0, 0]} onClick={klick} cursor="pointer">
          {daten.map((d) => (
            <Cell key={d.monat} fill={d.monat === gewaehlt ? '#f87171' : '#fca5a5'} />
          ))}
        </Bar>
        <Line dataKey="ist" name="Tatsächlich eingegangen" stroke="#047857" strokeWidth={2} dot={{ r: 3 }} type="monotone" connectNulls={false} />
        <Line dataKey="nurLaufzeit" name="ohne Verlängerungen" stroke="#6b7280" strokeDasharray="4 4" dot={false} type="monotone" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
