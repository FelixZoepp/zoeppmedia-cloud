'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDown, ArrowUp, Phone, Rocket, Search, Smartphone, TrendingDown } from 'lucide-react';
import { Avatar, Card, Input, PageHeader, SegmentedControl, StatCard } from '@/components/ui';
import type { Ampel } from '@/lib/kontrollzentrum/bewertung';
import type { Kontrollzentrum, KontrollZeile } from '@/lib/kontrollzentrum/laden';

const AMPEL: Record<Ampel, { label: string; cls: string; dot: string }> = {
  rot: { label: 'Rot', cls: 'bg-red-50 text-red-800', dot: 'bg-red-600' },
  gelb: { label: 'Gelb', cls: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  gruen: { label: 'Grün', cls: 'bg-green-50 text-green-800', dot: 'bg-green-600' },
};
const RANG: Record<Ampel, number> = { rot: 0, gelb: 1, gruen: 2 };

const PHASE: Record<string, string> = {
  zahlung: 'Zahlung',
  onboarding: 'Onboarding',
  setup: 'Setup',
  continuity: 'Kampagne läuft',
  offboarding: 'Offboarding',
};

const eur = (n: number | null) => (n === null ? '–' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`);
const pct = (n: number | null) => (n === null ? '–' : `${n} %`);
const dauer = (sek: number | null) => (sek === null ? '–' : sek < 3600 ? `${Math.max(1, Math.round(sek / 60))} Min.` : `${Math.round(sek / 3600)} Std.`);
const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : 'nie');

type SortKey = 'ampel' | 'name' | 'leads' | 'kontakt' | 'ttfc' | 'termine' | 'erscheinen' | 'einstellungen' | 'kpe' | 'login' | 'mrr' | 'marge';

const SPALTEN: Array<{ key: SortKey; label: string }> = [
  { key: 'ampel', label: 'Ampel' },
  { key: 'name', label: 'Kunde' },
  { key: 'leads', label: 'Leads' },
  { key: 'kontakt', label: 'Kontaktquote' },
  { key: 'ttfc', label: 'Erstkontakt' },
  { key: 'termine', label: 'Termine' },
  { key: 'erscheinen', label: 'Erschienen' },
  { key: 'einstellungen', label: 'Einstellungen' },
  { key: 'kpe', label: '€/Einstellung' },
  { key: 'login', label: 'Letzter Login' },
  { key: 'mrr', label: 'MRR' },
  { key: 'marge', label: 'Marge' },
];

/** Sortierwert; null landet immer hinten */
function wert(z: KontrollZeile, key: SortKey): number | string | null {
  switch (key) {
    case 'ampel': return RANG[z.ampel] * 10 - Number(z.churn.risiko);
    case 'name': return z.name.toLowerCase();
    case 'leads': return z.jetzt.leads;
    case 'kontakt': return z.jetzt.kontaktquote;
    case 'ttfc': return z.jetzt.ttfcMedianSek;
    case 'termine': return z.jetzt.termine;
    case 'erscheinen': return z.jetzt.erscheinensquote;
    case 'einstellungen': return z.jetzt.einstellungen;
    case 'kpe': return z.kostenProEinstellung;
    case 'login': return z.nutzung.letzterLogin;
    case 'mrr': return z.marge.umsatz;
    case 'marge': return z.marge.marge;
  }
}

/** Veränderung ggü. den 30 Tagen davor */
function Delta({ jetzt, vorher, einheit = '', umgekehrt = false }: { jetzt: number | null; vorher: number | null; einheit?: string; umgekehrt?: boolean }) {
  if (jetzt === null || vorher === null) return null;
  const d = jetzt - vorher;
  if (d === 0) return <span className="block text-[11px] text-gray-400">±0</span>;
  const gut = umgekehrt ? d < 0 : d > 0;
  return (
    <span className={`block text-[11px] font-medium ${gut ? 'text-green-700' : 'text-red-700'}`}>
      {d > 0 ? '+' : '−'}
      {Math.abs(d)}
      {einheit}
    </span>
  );
}

function Signale({ z }: { z: KontrollZeile }) {
  return (
    <div className="flex flex-wrap gap-1">
      {z.upsell.signal && (
        <span
          title={`${z.upsell.gruende.join(' · ')}\nAnsprechen: ${z.upsell.vorschlaege.join(', ')}`}
          className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11.5px] font-semibold text-green-800"
        >
          <Rocket className="h-3 w-3" /> Upsell
        </span>
      )}
      {z.churn.risiko && (
        <span title={z.churn.gruende.join(' · ')} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11.5px] font-semibold text-red-800">
          <TrendingDown className="h-3 w-3" /> Churn
        </span>
      )}
    </div>
  );
}

function Nutzung({ z }: { z: KontrollZeile }) {
  const n = z.nutzung;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-gray-600">
      <span title="Kunden-Nutzer mit Login in 30 Tagen / alle">
        {n.aktiveNutzer}/{n.kundenNutzer} aktiv
      </span>
      <span title="WhatsApp verbunden" className={`inline-flex items-center gap-0.5 ${n.whatsappVerbunden ? 'text-green-700' : 'text-gray-400'}`}>
        <Smartphone className="h-3 w-3" /> {n.whatsappVerbunden ? 'WA' : 'kein WA'}
      </span>
      <span title="Bewerber-Kontakt (Automatik) aktiv" className={n.bewerberKontaktAktiv ? 'text-green-700' : 'text-gray-400'}>
        {n.bewerberKontaktAktiv ? 'Kontakt an' : 'Kontakt aus'}
      </span>
      <span title="Anrufe im Anruf-Modus (30 T.)" className="inline-flex items-center gap-0.5">
        <Phone className="h-3 w-3" /> {z.jetzt.anrufe}
      </span>
    </div>
  );
}

function MargeZelle({ z, zeiterfassung }: { z: KontrollZeile; zeiterfassung: boolean }) {
  const m = z.marge;
  const titel = [
    `Umsatz (MRR): ${eur(m.umsatz)}`,
    `Team: ${m.teamKosten === null ? '–' : `${eur(m.teamKosten)} (${m.teamStunden} Std.)`}`,
    `Kommunikation (Schätzung): ${eur(m.kommKosten)}`,
    'Ohne Indeed',
  ].join('\n');
  return (
    <span title={titel}>
      <span className={`font-medium ${m.marge !== null && m.marge < 0 ? 'text-red-700' : ''}`}>{eur(m.marge)}</span>
      <span className="block text-[11px] text-gray-500">
        {m.margeProzent !== null ? `${m.margeProzent} %` : ''}
        {m.marge !== null && (m.teamKosten === null || !zeiterfassung) ? ' · ohne Team' : ''}
      </span>
    </span>
  );
}

export function KontrollzentrumClient({ daten }: { daten: Kontrollzentrum }) {
  const [ampel, setAmpel] = useState<string>('alle');
  const [nurUpsell, setNurUpsell] = useState(false);
  const [nurChurn, setNurChurn] = useState(false);
  const [suche, setSuche] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; ab: boolean }>({ key: 'ampel', ab: false });

  const alle = daten.zeilen;
  const liste = useMemo(() => {
    const gefiltert = alle.filter(
      (z) =>
        (ampel === 'alle' || z.ampel === ampel) &&
        (!nurUpsell || z.upsell.signal) &&
        (!nurChurn || z.churn.risiko) &&
        (!suche || z.name.toLowerCase().includes(suche.toLowerCase())),
    );
    if (sort.key === 'ampel' && !sort.ab) return gefiltert; // Standard: Reihenfolge vom Server (rot zuerst)
    const r = sort.ab ? -1 : 1;
    return [...gefiltert].sort((x, y) => {
      const a = wert(x, sort.key);
      const b = wert(y, sort.key);
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return (a < b ? -1 : a > b ? 1 : 0) * r;
    });
  }, [alle, ampel, nurUpsell, nurChurn, suche, sort]);

  const anzahl = (a: Ampel) => alle.filter((z) => z.ampel === a).length;
  const summe = (f: (z: KontrollZeile) => number | null) => alle.reduce((n, z) => n + (f(z) ?? 0), 0);
  const leads = summe((z) => z.jetzt.leads);
  const leadsVorher = summe((z) => z.vorher.leads);
  const einstellungen = summe((z) => z.jetzt.einstellungen);
  const mrr = summe((z) => z.marge.umsatz);
  const marge = summe((z) => z.marge.marge);
  const trend = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : undefined);

  const sortiere = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, ab: !s.ab } : { key, ab: !['ampel', 'name', 'ttfc', 'kpe'].includes(key) }));

  return (
    <div>
      <PageHeader
        label="STEUERUNG"
        title="Kontrollzentrum"
        description="Alle Kunden auf einen Blick: Ergebnisse, Nutzung, Ampel, Upsell, Churn-Risiko und Marge – letzte 30 Tage, Veränderung ggü. den 30 Tagen davor."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-6">
        <StatCard hero title="Kunden gesamt" value={alle.length} note={`${alle.filter((z) => z.churn.risiko).length} mit Churn-Risiko · ${alle.filter((z) => z.upsell.signal).length} Upsell`} />
        <StatCard title="Rot / Gelb / Grün" value={`${anzahl('rot')} / ${anzahl('gelb')} / ${anzahl('gruen')}`} note="Ampel" />
        <StatCard title="MRR gesamt" value={eur(mrr)} />
        <StatCard title="Marge gesamt" value={eur(marge)} note={daten.zeiterfassung && daten.stundensatz ? 'nach Team- und Kommunikationskosten' : 'ohne Teamkosten (Zeiterfassung fehlt)'} />
        <StatCard title="Leads (30 T.)" value={leads} trend={trend(leads, leadsVorher)} trendLabel="ggü. Vorperiode" />
        <StatCard title="Einstellungen (30 T.)" value={einstellungen} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-64">
          <Input pill icon={<Search />} placeholder="Kunde suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        </div>
        <SegmentedControl
          items={[
            { value: 'alle', label: `Alle (${alle.length})` },
            { value: 'rot', label: `Rot (${anzahl('rot')})` },
            { value: 'gelb', label: `Gelb (${anzahl('gelb')})` },
            { value: 'gruen', label: `Grün (${anzahl('gruen')})` },
          ]}
          value={ampel}
          onChange={setAmpel}
        />
        <label className="inline-flex cursor-pointer items-center gap-2 text-[14px]">
          <input type="checkbox" checked={nurUpsell} onChange={(e) => setNurUpsell(e.target.checked)} className="h-4 w-4 accent-red-700" /> Upsell
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-[14px]">
          <input type="checkbox" checked={nurChurn} onChange={(e) => setNurChurn(e.target.checked)} className="h-4 w-4 accent-red-700" /> Churn-Risiko
        </label>
        <select
          aria-label="Sortieren"
          className="rounded-full border border-gray-200 bg-card px-3 py-1.5 text-[14px] md:hidden"
          value={`${sort.key}:${sort.ab ? 'ab' : 'auf'}`}
          onChange={(e) => {
            const [key, r] = e.target.value.split(':');
            setSort({ key: key as SortKey, ab: r === 'ab' });
          }}
        >
          {SPALTEN.flatMap((s) => [
            <option key={`${s.key}:auf`} value={`${s.key}:auf`}>{s.label} ↑</option>,
            <option key={`${s.key}:ab`} value={`${s.key}:ab`}>{s.label} ↓</option>,
          ])}
        </select>
      </div>

      {liste.length === 0 ? (
        <Card inset>
          <p className="py-10 text-center text-[15px] text-gray-600">Kein Kunde für diesen Filter.</p>
        </Card>
      ) : (
        <>
          {/* Handy: Karten */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {liste.map((z) => (
              <Link key={z.id} href={`/clients/${z.id}`} className="block">
                <Card className={z.pausiert ? 'opacity-70' : ''}>
                  <div className="flex items-center gap-3">
                    <Avatar name={z.name} src={z.logo_url} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-medium">{z.name}</p>
                      <p className="text-[12.5px] text-gray-600">{z.pausiert ? 'Pausiert' : (z.phase && PHASE[z.phase]) || 'Kunde'}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${AMPEL[z.ampel].cls}`}>
                      <span className={`h-2 w-2 rounded-full ${AMPEL[z.ampel].dot}`} /> {AMPEL[z.ampel].label}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 rounded-[14px] bg-panel p-2.5 text-center text-[12px] text-gray-600">
                    <div><p className="text-[18px] font-semibold text-ink">{z.jetzt.leads}</p>Leads<Delta jetzt={z.jetzt.leads} vorher={z.vorher.leads} /></div>
                    <div><p className="text-[18px] font-semibold text-ink">{pct(z.jetzt.kontaktquote)}</p>Kontakt</div>
                    <div><p className="text-[18px] font-semibold text-ink">{z.jetzt.termine}</p>Termine</div>
                    <div><p className="text-[18px] font-semibold text-ink">{z.jetzt.einstellungen}</p>Einst.</div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                    <Nutzung z={z} />
                    <span className="text-gray-600">Marge <MargeZelle z={z} zeiterfassung={daten.zeiterfassung} /></span>
                  </div>
                  <div className="mt-2"><Signale z={z} /></div>
                  <Gruende z={z} />
                </Card>
              </Link>
            ))}
          </div>

          {/* Ab Tablet: sortierbare Tabelle */}
          <Card padding="none" className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1100px] text-left text-[13px]">
              <thead className="border-b border-gray-100 text-[12px] text-gray-600">
                <tr>
                  {SPALTEN.map((s) => (
                    <th key={s.key} className={`px-3 py-3 font-medium ${s.key === 'name' ? '' : 'whitespace-nowrap'}`}>
                      <button type="button" onClick={() => sortiere(s.key)} className="inline-flex items-center gap-1 hover:text-ink">
                        {s.label}
                        {sort.key === s.key && (sort.ab ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-3 font-medium">Nutzung</th>
                  <th className="px-3 py-3 font-medium">Signale</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((z) => (
                  <tr key={z.id} className={`border-b border-gray-50 align-top hover:bg-panel ${z.pausiert ? 'opacity-70' : ''}`}>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold ${AMPEL[z.ampel].cls}`}>
                        <span className={`h-2 w-2 rounded-full ${AMPEL[z.ampel].dot}`} /> {AMPEL[z.ampel].label}
                      </span>
                    </td>
                    <td className="max-w-[260px] px-3 py-3">
                      <Link href={`/clients/${z.id}`} className="flex items-center gap-2.5 hover:underline">
                        <Avatar name={z.name} src={z.logo_url} size={28} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{z.name}</span>
                          <span className="block text-[11.5px] text-gray-500">{z.pausiert ? 'Pausiert' : (z.phase && PHASE[z.phase]) || 'Kunde'}</span>
                        </span>
                      </Link>
                      <Gruende z={z} />
                    </td>
                    <td className="px-3 py-3 font-medium">{z.jetzt.leads}<Delta jetzt={z.jetzt.leads} vorher={z.vorher.leads} /></td>
                    <td className="px-3 py-3">{pct(z.jetzt.kontaktquote)}<Delta jetzt={z.jetzt.kontaktquote} vorher={z.vorher.kontaktquote} einheit=" PP" /></td>
                    <td className="whitespace-nowrap px-3 py-3" title="Median Zeit bis Erstkontakt">{dauer(z.jetzt.ttfcMedianSek)}</td>
                    <td className="px-3 py-3">{z.jetzt.termine}<Delta jetzt={z.jetzt.termine} vorher={z.vorher.termine} /></td>
                    <td className="px-3 py-3" title={`${z.jetzt.erschienen} erschienen, ${z.jetzt.noShows} No-Shows`}>{pct(z.jetzt.erscheinensquote)}</td>
                    <td className="px-3 py-3 font-medium">{z.jetzt.einstellungen}<Delta jetzt={z.jetzt.einstellungen} vorher={z.vorher.einstellungen} /></td>
                    <td className="whitespace-nowrap px-3 py-3" title="(MRR + Werbebudget) / Einstellungen, ohne Indeed">{eur(z.kostenProEinstellung)}</td>
                    <td className="whitespace-nowrap px-3 py-3">{datum(z.nutzung.letzterLogin)}</td>
                    <td className="whitespace-nowrap px-3 py-3">{eur(z.marge.umsatz)}</td>
                    <td className="whitespace-nowrap px-3 py-3"><MargeZelle z={z} zeiterfassung={daten.zeiterfassung} /></td>
                    <td className="min-w-[170px] px-3 py-3"><Nutzung z={z} /></td>
                    <td className="px-3 py-3"><Signale z={z} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <p className="mt-4 text-[12px] text-gray-500">
        Marge = MRR − Teamstunden × Stundensatz ({daten.stundensatz ? eur(daten.stundensatz) + '/Std.' : 'nicht hinterlegt'}
        {daten.zeiterfassung ? '' : ', Zeiterfassung fehlt'}) − Kommunikation (Schätzung: Anrufminuten und WhatsApp-Vorlagen je 0,05 €). Indeed wird nicht abgezogen. Stand{' '}
        {new Date(daten.stand).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}.
      </p>
    </div>
  );
}

function Gruende({ z }: { z: KontrollZeile }) {
  const alle = [...z.gruende, ...z.churn.gruende.filter((g) => !z.gruende.includes(g))];
  if (!alle.length && !z.upsell.signal) return null;
  return (
    <ul className="mt-1.5 space-y-0.5">
      {alle.map((g) => (
        <li key={g} className={`flex items-start gap-1 text-[11.5px] ${z.ampel === 'rot' || z.churn.gruende.includes(g) ? 'text-red-800' : 'text-amber-800'}`}>
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-none" /> {g}
        </li>
      ))}
      {z.upsell.signal && (
        <li className="text-[11.5px] text-green-800">
          {z.upsell.gruende.join(' · ')} → ansprechen: {z.upsell.vorschlaege.join(', ')}
        </li>
      )}
    </ul>
  );
}
