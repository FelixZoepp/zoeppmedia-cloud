'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Search } from 'lucide-react';
import { Avatar, Card, Input, PageHeader, SegmentedControl, StatCard } from '@/components/ui';
import type { Ampel, KundeErgebnis } from '@/lib/kunden-cloud/ergebnisse';

const PHASE: Record<string, string> = {
  zahlung: 'Zahlung',
  onboarding: 'Onboarding',
  setup: 'Setup',
  continuity: 'Kampagne läuft',
  offboarding: 'Offboarding',
};

const AMPEL: Record<Ampel, { label: string; cls: string; dot: string }> = {
  rot: { label: 'Handlungsbedarf', cls: 'bg-red-50 text-red-800', dot: 'bg-red-600' },
  gelb: { label: 'Beobachten', cls: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  gruen: { label: 'Läuft', cls: 'bg-green-50 text-green-800', dot: 'bg-green-600' },
};

const pct = (n: number | null) => (n === null ? '–' : `${n} %`);

export function ErgebnisseClient() {
  const [daten, setDaten] = useState<{ kunden: KundeErgebnis[]; meine: string[] } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<string | null>(null);
  const [suche, setSuche] = useState('');

  useEffect(() => {
    fetch('/api/ergebnisse', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? 'Fehler');
        setDaten(d);
      })
      .catch((e) => setFehler(e instanceof Error ? e.message : 'Ergebnisse konnten nicht geladen werden'));
  }, []);

  // Wer eigene Kunden hat, startet mit „Meine Kunden“
  const filter = ansicht ?? (daten && daten.meine.length > 0 ? 'meine' : 'alle');
  const liste = (daten?.kunden ?? []).filter(
    (k) => (filter === 'alle' || daten?.meine.includes(k.id)) && (!suche || k.name.toLowerCase().includes(suche.toLowerCase())),
  );
  const summe = (f: (k: KundeErgebnis) => number) => liste.reduce((n, k) => n + f(k), 0);
  const probleme = liste.filter((k) => k.ampel === 'rot').length;

  return (
    <div>
      <PageHeader
        label="KUNDENBETREUUNG"
        title="Kunden-Ergebnisse"
        description="Was bei deinen Kunden rauskommt – Bewerber, Termine und Einstellungen der letzten 30 Tage auf einen Blick."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard hero title="Neue Bewerber (30 T.)" value={summe((k) => k.bewerber30)} note={`${liste.length} Kunden`} />
        <StatCard title="Termine (30 T.)" value={summe((k) => k.termine30)} note={`${summe((k) => k.noShows30)} No-Shows`} />
        <StatCard title="Einstellungen (30 T.)" value={summe((k) => k.einstellungen30)} />
        <StatCard title="Handlungsbedarf" value={probleme} note={probleme ? 'Kunden mit roter Ampel' : 'alles im grünen Bereich'} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72">
          <Input pill icon={<Search />} placeholder="Kunde suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        </div>
        <SegmentedControl
          items={[
            { value: 'meine', label: `Meine Kunden (${daten?.meine.length ?? 0})` },
            { value: 'alle', label: `Alle (${daten?.kunden.length ?? 0})` },
          ]}
          value={filter}
          onChange={setAnsicht}
        />
      </div>

      {fehler && (
        <Card className="mb-4 flex items-start gap-3 text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
          <p className="text-[14px]">{fehler}</p>
        </Card>
      )}

      {!daten ? (
        !fehler && (
          <div className="flex justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
          </div>
        )
      ) : liste.length === 0 ? (
        <Card inset>
          <p className="py-10 text-center text-[15px] text-gray-600">
            {filter === 'meine' ? 'Dir sind noch keine Kunden zugeordnet – wechsle auf „Alle“.' : 'Kein Kunde gefunden.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {liste.map((k, i) => (
            <ErgebnisKarte key={k.id} k={k} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function ErgebnisKarte({ k, index }: { k: KundeErgebnis; index: number }) {
  const a = AMPEL[k.ampel];
  const trend = k.bewerberVorher > 0 ? Math.round(((k.bewerber30 - k.bewerberVorher) / k.bewerberVorher) * 100) : null;
  const zahlen = [
    { l: 'Bewerber', n: k.bewerber30 },
    { l: 'Termine', n: k.termine30 },
    { l: 'Einstellungen', n: k.einstellungen30 },
  ];
  return (
    <Card className={`fx-rise flex flex-col ${k.pausiert ? 'opacity-70' : ''}`} style={{ '--d': `${Math.min(index, 12) * 40}ms` } as React.CSSProperties}>
      <div className="flex items-center gap-3.5">
        <Avatar name={k.name} src={k.logo_url} size={48} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-medium tracking-[-0.02em]">{k.name}</h2>
          <p className="text-[13px] text-gray-600">{k.pausiert ? 'Pausiert' : (k.phase && PHASE[k.phase]) || 'Kunde'}</p>
        </div>
        <span className={`inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${a.cls}`}>
          <span className={`h-2 w-2 rounded-full ${a.dot}`} /> {a.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-[16px] bg-panel p-3 text-center">
        {zahlen.map((z) => (
          <div key={z.l}>
            <p className={`text-[24px] font-semibold leading-none tracking-[-0.03em] ${z.n === 0 ? 'text-gray-400' : 'text-ink'}`}>{z.n}</p>
            <p className="mt-1 text-[12px] text-gray-600">{z.l}</p>
          </div>
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-gray-600">ggü. Vormonat</dt>
          <dd className={`inline-flex items-center gap-0.5 font-medium ${trend === null ? 'text-gray-400' : trend >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {trend === null ? '–' : (
              <>
                {trend >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {Math.abs(trend)} %
              </>
            )}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-600">Kontaktiert</dt>
          <dd className="font-medium">{pct(k.kontaktquote)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-600">Speed-to-Lead</dt>
          <dd className="font-medium">{k.speedToLeadMin === null ? '–' : k.speedToLeadMin < 120 ? `${k.speedToLeadMin} Min.` : `${Math.round(k.speedToLeadMin / 60)} Std.`}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-600">Erreichbarkeit</dt>
          <dd className="font-medium">{pct(k.erreichbarkeit)}</dd>
        </div>
      </dl>

      <p className={`mt-2 text-[12.5px] ${k.umsaetzeFehlen ? 'font-medium text-amber-800' : 'text-gray-600'}`}>
        {k.umsatzLetzterMonat !== null
          ? `Umsatz Neue: ${k.umsatzLetzterMonat.toLocaleString('de-DE', { maximumFractionDigits: 0 })} € · ROI ${k.roi === null ? '–' : `${k.roi.toLocaleString('de-DE', { maximumFractionDigits: 1 })}×`}`
          : k.umsaetzeFehlen
            ? 'Umsätze der Neuen fehlen – Kunde muss eintragen'
            : k.einstellungen30 > 0
              ? 'Noch keine Umsätze eingetragen'
              : null}
        {k.umsatzLetzterMonat !== null && k.umsaetzeFehlen && ' · Einträge unvollständig'}
      </p>

      {k.hinweise.length > 0 && (
        <ul className="mt-3 space-y-1">
          {k.hinweise.map((h) => (
            <li key={h} className={`flex items-start gap-1.5 text-[12.5px] ${k.ampel === 'rot' ? 'text-red-800' : 'text-amber-800'}`}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" /> {h}
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/clients/${k.id}`}
        className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[14px] font-medium text-red-800 hover:underline"
      >
        Zum Kunden <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  );
}
