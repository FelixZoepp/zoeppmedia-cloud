'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';

interface Analyse {
  seit: string | null;
  gesamt: { tage_kunde: number; tage_zoepp: number };
  verspaetung: { kunde: number; zoepp: number };
  kunden: Array<{
    agency_id: string; name: string; phase: string; tage_kunde: number; tage_zoepp: number; tage_ueber_frist: number;
    bremse: 'kunde' | 'zoepp' | null; langsamste: Array<{ titel: string; wer: 'kunde' | 'zoepp'; tage_ueber_frist: number }>;
    erfasst: Array<{ tage: number; wer: 'kunde' | 'zoepp'; grund: string }>;
  }>;
  gruende: Array<{ grund: string; wer: 'kunde' | 'zoepp'; tage: number; anzahl: number }>;
  schritte: Array<{ step_key: string; titel: string; wer: 'kunde' | 'zoepp'; anzahl: number; davon_verspaetet: number; schnitt_ueber_frist: number }>;
}

function Balken({ kunde, zoepp }: { kunde: number; zoepp: number }) {
  const sum = kunde + zoepp || 1;
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
      <div className="bg-amber-400" style={{ width: `${(kunde / sum) * 100}%` }} />
      <div className="bg-sky-500" style={{ width: `${(zoepp / sum) * 100}%` }} />
    </div>
  );
}

const WerBadge = ({ wer }: { wer: 'kunde' | 'zoepp' }) =>
  wer === 'kunde' ? (
    <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800"><Building2 className="w-3 h-3" /> Kunde</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-800"><Users className="w-3 h-3" /> wir</span>
  );

export default function StartAnalysePage() {
  const [a, setA] = useState<Analyse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/fulfillment/analyse')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setA(d);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!a) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  const v = a.verspaetung;
  const fazit =
    v.kunde + v.zoepp === 0
      ? 'Noch keine Verspätungen – alles im Plan.'
      : v.kunde >= v.zoepp
        ? `Verspätungen liegen vor allem beim Kunden (${v.kunde} von ${Math.round((v.kunde + v.zoepp) * 10) / 10} Tagen). Hebel: früher und konsequenter nachfassen.`
        : `Verspätungen liegen vor allem bei uns (${v.zoepp} von ${Math.round((v.kunde + v.zoepp) * 10) / 10} Tagen). Hebel: mehr Kapazität im Fulfillment oder Prozess vereinfachen.`;

  return (
    <div>
      <PageHeader label="COCKPIT" title="Warum verzögern sich Starts?" counter={a.seit ? `Daten seit ${new Date(a.seit).toLocaleDateString('de-DE')}` : undefined} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card padding="sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Verspätung durch Kunden</p>
          <p className="text-3xl font-bold text-amber-600 mt-1">{v.kunde} Tage</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Verspätung durch uns</p>
          <p className="text-3xl font-bold text-sky-600 mt-1">{v.zoepp} Tage</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Fazit</p>
          <p className="text-sm text-gray-800 mt-1">{fazit}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padding="none" className="overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 text-sm font-bold">Diese Schritte bremsen am meisten</div>
          <div className="px-4 divide-y divide-gray-100">
            {a.schritte.map((s) => (
              <div key={s.step_key} className="py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{s.titel}</p>
                  <p className="text-xs text-gray-500">{s.davon_verspaetet} von {s.anzahl} Kunden zu spät · im Schnitt {s.schnitt_ueber_frist} Tage</p>
                </div>
                <WerBadge wer={s.wer} />
              </div>
            ))}
            {!a.schritte.length && <p className="py-6 text-sm text-gray-500 text-center">Noch keine verspäteten Schritte.</p>}
          </div>
          {a.gruende.length > 0 && (
            <>
              <div className="px-4 py-2.5 bg-gray-50 text-sm font-bold border-t border-gray-100">Erfasste Gründe</div>
              <div className="px-4 divide-y divide-gray-100">
                {a.gruende.map((g) => (
                  <div key={`${g.wer}-${g.grund}`} className="py-2.5 flex items-center gap-3">
                    <p className="text-sm text-gray-900 flex-1">{g.grund}</p>
                    <span className="text-xs text-gray-500">{g.anzahl}× · {g.tage} Tage</span>
                    <WerBadge wer={g.wer} />
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card padding="none" className="overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 text-sm font-bold flex items-center gap-3">
            Kunden bis zum Start
            <span className="ml-auto flex items-center gap-2 text-[11px] font-normal text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> beim Kunden
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> bei uns
            </span>
          </div>
          <div className="px-4 divide-y divide-gray-100">
            {a.kunden.map((k) => (
              <Link key={k.agency_id} href={`/clients/${k.agency_id}/ablauf`} className="block py-2.5 hover:bg-gray-50 -mx-4 px-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-medium text-gray-900 flex-1">{k.name}</span>
                  <span className="text-xs text-gray-500">{k.tage_kunde} T. Kunde · {k.tage_zoepp} T. wir</span>
                  {k.tage_ueber_frist > 0 && <span className="text-xs font-semibold text-red-600">+{k.tage_ueber_frist} T.</span>}
                </div>
                <Balken kunde={k.tage_kunde} zoepp={k.tage_zoepp} />
                {k.erfasst.length > 0 && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    Erfasst: {k.erfasst.map((e) => `${e.grund} (${e.tage} T., ${e.wer === 'kunde' ? 'Kunde' : 'wir'})`).join(' · ')}
                  </p>
                )}
                {k.langsamste.length > 0 && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    Bremst: {k.langsamste.map((l) => `${l.titel} (+${l.tage_ueber_frist} T., ${l.wer === 'kunde' ? 'Kunde' : 'wir'})`).join(' · ')}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </Card>
      </div>
      <p className="text-xs text-gray-400 mt-4">
        Gezählt wird ab der Umstellung auf das neue Ablauf-System. „Zur Prüfung“ zählt als Zeit bei uns, „zurück an Kunden“ wieder beim Kunden.
      </p>
    </div>
  );
}
