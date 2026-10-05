'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Smile, Star } from 'lucide-react';
import { Avatar, Card, CountUp } from '@/components/ui';
import type { SatisfactionStats } from '@/lib/surveys/analytics';

function tone(n: number | null) {
  if (n === null) return 'text-gray-400';
  if (n >= 4) return 'text-green-700';
  if (n >= 3) return 'text-amber-700';
  return 'text-red-700';
}

function Bar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
      <div
        className={`h-full origin-left rounded-full ${value >= 4 ? 'bg-green-600' : value >= 3 ? 'bg-amber-500' : 'bg-red-700'}`}
        style={{ width: `${pct}%`, animation: 'fx-bar 1s cubic-bezier(.33,1,.68,1) .15s both' }}
      />
    </div>
  );
}

/** Zufriedenheits-Auswertung mit Durchschnitten (Skala 1–5) */
export function SatisfactionOverview() {
  const [s, setS] = useState<SatisfactionStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/surveys/analytics')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setS(d));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!s) return null;

  if (s.gesamt.anzahl === 0) {
    return (
      <Card className="mb-6 flex items-center gap-4">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-panel text-gray-500">
          <Smile className="h-6 w-6" />
        </span>
        <div>
          <p className="text-[17px] font-medium">Noch keine Zufriedenheits-Bewertungen</p>
          <p className="text-[13.5px] text-gray-600">Sobald Kunden die Feedback-Checks ausfüllen, erscheinen hier die Durchschnitte – gesamt, je Kunde, je Betreuer und je Frage.</p>
        </div>
      </Card>
    );
  }

  const maxVerlauf = 5;
  return (
    <div className="mb-6 space-y-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card hero>
          <p className="text-[15px] font-medium">Zufriedenheit gesamt</p>
          <p className="mt-4 flex items-baseline gap-2 text-[52px] font-semibold leading-none tracking-[-0.04em]">
            <CountUp value={s.gesamt.schnitt ?? 0} decimals={1} />
            <span className="text-[20px] font-medium text-red-200">/ 5</span>
          </p>
          <p className="mt-2 text-[13.5px] text-red-200">Durchschnitt aus {s.gesamt.anzahl} Bewertung{s.gesamt.anzahl === 1 ? '' : 'en'}</p>
          {s.kritisch.length > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12.5px]">
              <AlertTriangle className="h-3.5 w-3.5" /> {s.kritisch.length} Kunde{s.kritisch.length === 1 ? '' : 'n'} unter 3,0
            </p>
          )}
        </Card>
        <Card>
          <p className="text-[17px] font-medium">Verlauf (Durchschnitt je Monat)</p>
          <div className="mt-5 grid h-[140px] grid-cols-6 items-end gap-3">
            {s.verlauf.map((v) => (
              <div key={v.monat} className="flex h-full flex-col items-center justify-end gap-2">
                <span className={`text-[12.5px] font-semibold ${tone(v.schnitt)}`}>{v.schnitt?.toLocaleString('de-DE') ?? '–'}</span>
                <div
                  className={`w-full max-w-[44px] origin-bottom rounded-full ${v.schnitt === null ? 'fx-hatch' : v.schnitt >= 4 ? 'bg-green-600' : v.schnitt >= 3 ? 'bg-amber-500' : 'bg-red-700'}`}
                  style={{ height: `${v.schnitt ? Math.max(12, (v.schnitt / maxVerlauf) * 100) : 18}%`, animation: 'fx-grow .9s cubic-bezier(.33,1,.68,1) both' }}
                />
                <span className="text-[11.5px] text-gray-500">
                  {new Date(`${v.monat}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-[17px] font-medium">Je Kunde</p>
          <ul className="mt-3 space-y-2.5">
            {s.jeKunde.map((k) => (
              <li key={k.agency_id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{k.name}</span>
                  <span className="block text-[12px] text-gray-500">
                    {k.anzahl} Bewertung{k.anzahl === 1 ? '' : 'en'}
                    {k.betreuer ? ` · ${k.betreuer}` : ''}
                  </span>
                </span>
                <span className={`inline-flex items-center gap-1 text-[15px] font-semibold ${tone(k.schnitt)}`}>
                  <Star className="h-3.5 w-3.5 fill-current" /> {k.schnitt.toLocaleString('de-DE')}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <p className="text-[17px] font-medium">Je Betreuer</p>
          <ul className="mt-3 space-y-3">
            {s.jeBetreuer.map((b) => (
              <li key={b.user_id ?? 'ohne'} className="flex items-center gap-3">
                <Avatar name={b.name} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-[14px] font-medium">
                    <span className="truncate">{b.name}</span>
                    <span className={tone(b.schnitt)}>{b.schnitt.toLocaleString('de-DE')}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <Bar value={b.schnitt} />
                    <span className="flex-none text-[11.5px] text-gray-500">{b.kunden} Kd.</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <p className="text-[17px] font-medium">Je Frage</p>
          <ul className="mt-3 space-y-3">
            {s.jeFrage.map((f) => (
              <li key={f.id}>
                <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
                  <span className="min-w-0">{f.label}</span>
                  <span className={`flex-none font-semibold ${tone(f.schnitt)}`}>{f.schnitt.toLocaleString('de-DE')}</span>
                </div>
                <div className="mt-1 flex">
                  <Bar value={f.schnitt} />
                </div>
              </li>
            ))}
            {s.jeFrage.length === 0 && <li className="text-[13.5px] text-gray-500">Keine Einzelfragen beantwortet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
