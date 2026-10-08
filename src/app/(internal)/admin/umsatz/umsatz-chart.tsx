'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Eigene Datei, damit recharts per next/dynamic erst bei Bedarf geladen wird
export function UmsatzChart({ daten }: { daten: Array<{ monat: string; neukunde: number; bestand: number; upsell: number }> }) {
  const eur = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;
  const monat = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={daten} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="monat" tickFormatter={monat} tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} width={40} />
        <Tooltip formatter={(v) => eur(Number(v))} labelFormatter={(m) => monat(String(m))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="neukunde" name="Neukunden" stackId="u" fill="#991b1b" />
        <Bar dataKey="upsell" name="Upsell/Verlängerung" stackId="u" fill="#ef4444" />
        <Bar dataKey="bestand" name="Bestandskunden" stackId="u" fill="#fca5a5" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
