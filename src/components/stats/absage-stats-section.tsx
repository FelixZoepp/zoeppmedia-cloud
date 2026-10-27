'use client';

import { useEffect, useState } from 'react';
import { UserX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { AbsageStats } from '@/lib/kpi/absage-stats';

const pct = (v: number) => `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })} %`;
const datum = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });

/** Balkenfarbe je Gruppe */
export const GRUPPE_FARBE: Record<string, string> = {
  erscheinen: 'bg-red-700',
  eindruck: 'bg-amber-500',
  voraussetzungen: 'bg-sky-600',
  erwartung: 'bg-violet-500',
  probetag: 'bg-green-600',
  sonstiges: 'bg-gray-400',
};

function Balken({ label, anzahl, anteil, max, farbe }: { label: string; anzahl: number; anteil: number; max: number; farbe: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="truncate text-gray-700">{label}</span>
        <span className="flex-none tabular-nums text-gray-500">
          {anzahl} · {pct(anteil)}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-gray-100">
        <div className={`h-2 rounded-full ${farbe}`} style={{ width: `${Math.max(2, (anzahl / max) * 100)}%` }} />
      </div>
    </div>
  );
}

/** Darstellung der Absagegründe (Kunde + Admin) */
export function AbsageAuswertung({ d, mitListe = true }: { d: AbsageStats; mitListe?: boolean }) {
  if (d.gesamt === 0) return <p className="text-[13.5px] text-gray-500">Im Zeitraum wurde noch niemand abgesagt.</p>;
  const maxGrund = Math.max(1, ...d.proGrund.map((g) => g.anzahl));
  const maxPhase = Math.max(1, ...d.proPhase.map((p) => p.anzahl));
  const maxWoche = Math.max(1, ...d.proWoche.map((w) => w.anzahl));
  const top = d.proGrund[0];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: 'Absagen', v: d.gesamt.toLocaleString('de-DE'), s: d.ohneGrund ? `${d.ohneGrund} ohne Grund (alt)` : 'alle mit Grund' },
          { l: 'Häufigster Grund', v: top ? pct(top.anteil) : '–', s: top?.label ?? '' },
          { l: 'Häufigste Gruppe', v: d.proGruppe[0] ? pct(d.proGruppe[0].anteil) : '–', s: d.proGruppe[0]?.label ?? '' },
          { l: 'Häufigste Phase', v: d.proPhase[0] ? pct(d.proPhase[0].anteil) : '–', s: d.proPhase[0] ? `abgesagt nach „${d.proPhase[0].phase}“` : '' },
        ].map((k) => (
          <div key={k.l} className="rounded-[16px] bg-panel p-3.5">
            <p className="text-[12.5px] text-gray-600">{k.l}</p>
            <p className="mt-1 text-[22px] font-semibold leading-none tracking-[-0.03em]">{k.v}</p>
            <p className="mt-1.5 truncate text-[12px] text-gray-500" title={k.s}>
              {k.s}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2.5">
          <h3 className="text-[13px] font-semibold text-gray-900">Nach Grund</h3>
          {d.proGrund.map((g) => (
            <Balken key={g.code} label={g.label} anzahl={g.anzahl} anteil={g.anteil} max={maxGrund} farbe={GRUPPE_FARBE[g.gruppe] ?? 'bg-gray-400'} />
          ))}
        </div>
        <div className="space-y-5">
          <div className="space-y-2.5">
            <h3 className="text-[13px] font-semibold text-gray-900">Abgesagt nach Phase</h3>
            {d.proPhase.map((p) => (
              <Balken key={p.phase} label={p.phase} anzahl={p.anzahl} anteil={p.anteil} max={maxPhase} farbe="bg-gray-700" />
            ))}
          </div>
          {d.proWoche.length > 1 && (
            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-gray-900">Verlauf je Woche</h3>
              <div className="flex h-24 items-end gap-1">
                {d.proWoche.map((w) => (
                  <div key={w.woche} className="flex flex-1 flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(w.anzahl / maxWoche) * 100}%` }} title={`KW ab ${datum(w.woche)}: ${w.anzahl}`}>
                    {Object.entries(w.gruppen).map(([g, n]) => (
                      <div key={g} className={GRUPPE_FARBE[g] ?? 'bg-gray-400'} style={{ height: `${(n / w.anzahl) * 100}%` }} />
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-gray-400">
                <span>{datum(d.proWoche[0].woche)}</span>
                <span>{datum(d.proWoche[d.proWoche.length - 1].woche)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {mitListe && d.letzte.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-gray-900">Letzte Absagen</h3>
          <div className="divide-y divide-gray-100 rounded-[14px] border border-gray-100">
            {d.letzte.map((l) => (
              <a key={l.id} href={`/candidates/${l.id}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-[13px] hover:bg-gray-50">
                <span className="w-12 flex-none tabular-nums text-gray-400">{datum(l.am)}</span>
                <span className="font-medium text-gray-900">{l.name ?? 'Bewerber'}</span>
                <span className="text-gray-600">{l.grund}</span>
                {l.phase && <span className="text-gray-400">nach „{l.phase}“</span>}
                {l.notiz && <span className="w-full pl-[60px] text-gray-500">„{l.notiz}“</span>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Absagegründe für die Statistik-Seite (eigener Abruf, gleicher Zeitraum wie die Seite) */
export function AbsageStatsSection({ from, to }: { from: string; to: string }) {
  const [d, setD] = useState<AbsageStats | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/recruiting-stats/absagen?${new URLSearchParams({ from, to }).toString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => setD(x))
      .catch(() => {});
    return () => ctrl.abort();
  }, [from, to]);

  if (!d) return null;
  return (
    <Card padding="md">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <UserX className="h-4 w-4 text-red-800" /> Absagegründe
      </h2>
      <AbsageAuswertung d={d} />
    </Card>
  );
}
