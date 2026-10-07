'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, ChevronDown, Clock, Hourglass, Search, User } from 'lucide-react';
import { Card } from '@/components/ui';
import type { Fahrplan as FahrplanDaten, FahrplanSchritt } from '@/lib/fulfillment/fahrplan';

const datum = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });

function Schritt({ s }: { s: FahrplanSchritt }) {
  const icon =
    s.status === 'erledigt' ? (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white"><Check className="h-3 w-3" strokeWidth={3} /></span>
    ) : s.status === 'du' ? (
      <span className={`flex h-5 w-5 items-center justify-center rounded-full ${s.faellig ? 'bg-amber-100 text-amber-700' : 'bg-red-50 text-red-700'}`}><User className="h-3 w-3" /></span>
    ) : s.status === 'pruefung' ? (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-600"><Search className="h-3 w-3" /></span>
    ) : s.status === 'in_arbeit' ? (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-600"><Hourglass className="h-3 w-3" /></span>
    ) : (
      <span className="h-5 w-5 rounded-full border border-dashed border-gray-300" />
    );
  const hinweis =
    s.status === 'erledigt'
      ? null
      : s.status === 'du'
        ? s.faellig
          ? 'Wartet auf dich'
          : s.datum
            ? `Du · bis ${datum(s.datum)}`
            : 'Du'
        : s.status === 'pruefung'
          ? 'Wir prüfen'
          : s.status === 'in_arbeit'
            ? s.datum
              ? `In Arbeit · geplant bis ${datum(s.datum)}`
              : 'In Arbeit bei uns'
            : s.wer === 'kunde'
              ? 'Kommt noch (du)'
              : 'Kommt noch';
  return (
    <li className="flex items-center gap-2.5 py-1">
      {icon}
      <span className={`min-w-0 flex-1 truncate text-[14px] ${s.status === 'erledigt' ? 'text-gray-500' : s.status === 'geplant' ? 'text-gray-500' : 'text-gray-900'}`}>{s.titel}</span>
      {hinweis && (
        <span className={`shrink-0 text-[12.5px] ${s.status === 'du' && s.faellig ? 'font-medium text-amber-700' : s.status === 'du' ? 'font-medium text-red-700' : 'text-gray-500'}`}>{hinweis}</span>
      )}
    </li>
  );
}

/** „Dein Fahrplan“: Fortschritt bis zum Kampagnenstart, wer gerade dran ist, alle Schritte nach Phase */
export function Fahrplan({ mitLink = true }: { mitLink?: boolean }) {
  const [f, setF] = useState<FahrplanDaten | null>(null);
  const [offen, setOffen] = useState(false);

  useEffect(() => {
    let aktiv = true;
    fetch('/api/fahrplan', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => aktiv && d?.fahrplan && setF(d.fahrplan))
      .catch(() => {});
    return () => {
      aktiv = false;
    };
  }, []);

  if (!f || f.phase === 'offboarding' || f.phase === 'beendet') return null;
  if (f.live) {
    if (!f.nachlauf.length) return null;
    return (
      <Card className="mb-6">
        <h2 className="text-[19px] font-medium tracking-[-0.02em]">Noch im Aufbau</h2>
        <div className={`mt-3 rounded-xl px-3.5 py-2.5 text-[14px] ${f.ball.wer === 'kunde' ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-800'}`}>
          {f.ball.text}
          {f.ball.wer === 'kunde' && mitLink && (
            <Link href="/deine-aufgaben" className="ml-1.5 font-semibold text-red-700 hover:underline">
              Zu deinen Aufgaben →
            </Link>
          )}
        </div>
        <ul className="mt-2">
          {f.nachlauf.map((s) => (
            <Schritt key={s.key} s={s} />
          ))}
        </ul>
      </Card>
    );
  }
  const aktivePhase = f.phasen.find((p) => p.status === 'aktiv');
  const sichtbar = offen ? f.phasen.filter((p) => p.key !== 'continuity') : aktivePhase ? [aktivePhase] : [];

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[19px] font-medium tracking-[-0.02em]">Dein Fahrplan</h2>
        {f.startDatum && (
          <span className="inline-flex items-center gap-1 text-[13px] text-gray-600">
            <Clock className="h-3.5 w-3.5" /> Voraussichtlicher Start: <strong className="font-semibold text-gray-900">{datum(f.startDatum)}</strong>
          </span>
        )}
      </div>

      {/* Phasen + Fortschritt */}
      <div className="mt-3 flex items-center gap-1.5">
        {f.phasen.map((p) => (
          <div key={p.key} className="min-w-0 flex-1">
            <div className={`h-1.5 rounded-full ${p.status === 'fertig' ? 'bg-green-600' : p.status === 'aktiv' ? 'bg-red-700' : 'bg-gray-200'}`} />
            <p className={`mt-1 truncate text-[12px] ${p.status === 'aktiv' ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{p.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[12.5px] text-gray-500">
        {f.erledigt} von {f.gesamt} Schritten bis zum Start erledigt ({f.fortschritt} %)
      </p>

      {/* Wer ist dran? */}
      <div className={`mt-3 rounded-xl px-3.5 py-2.5 text-[14px] ${f.ball.wer === 'kunde' ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-800'}`}>
        {f.ball.text}
        {f.ball.wer === 'kunde' && mitLink && (
          <Link href="/deine-aufgaben" className="ml-1.5 font-semibold text-red-700 hover:underline">
            Zu deinen Aufgaben →
          </Link>
        )}
      </div>

      {/* Schritte */}
      {sichtbar.map((p) => (
        <div key={p.key} className="mt-3">
          {offen && <p className="text-[12.5px] font-semibold uppercase tracking-wide text-gray-500">{p.label}</p>}
          <ul className="mt-0.5">
            {p.schritte.map((s) => (
              <Schritt key={s.key} s={s} />
            ))}
          </ul>
        </div>
      ))}
      <button onClick={() => setOffen((o) => !o)} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-red-700">
        {offen ? 'Nur aktuelle Phase' : 'Alle Schritte bis zum Start'} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${offen ? 'rotate-180' : ''}`} />
      </button>
    </Card>
  );
}
