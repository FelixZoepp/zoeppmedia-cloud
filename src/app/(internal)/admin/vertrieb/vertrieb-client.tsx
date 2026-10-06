'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info, Loader2, Megaphone, PhoneCall, RefreshCw, Target, TrendingUp, Users } from 'lucide-react';
import { Avatar, Button, Card, CountUp, PageHeader, SegmentedControl } from '@/components/ui';
import type { SalesControlling } from '@/lib/sales-controlling/compute';

type Daten = SalesControlling & { metaVerbunden: boolean };

const eur = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? '–' : `${n.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits })} €`;
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`);
const zahl = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n.toLocaleString('de-DE', { maximumFractionDigits: 1 }));
const monatKurz = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'short' });

function Delta({ jetzt, vorher, invert = false, einheit = '' }: { jetzt: number | null; vorher: number | null; invert?: boolean; einheit?: string }) {
  if (jetzt === null || vorher === null || vorher === 0) return null;
  const diff = jetzt - vorher;
  if (diff === 0) return <span className="text-[12px] text-gray-500">± 0{einheit}</span>;
  const gut = invert ? diff < 0 : diff > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[12px] font-medium ${gut ? 'text-green-700' : 'text-red-700'}`}>
      {diff > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {diff > 0 ? '+' : '−'}
      {Math.abs(diff).toLocaleString('de-DE', { maximumFractionDigits: 1 })}
      {einheit} ggü. Vorperiode
    </span>
  );
}

function Kennzahl({ label, wert, sub, delta }: { label: string; wert: string; sub?: React.ReactNode; delta?: React.ReactNode }) {
  return (
    <div className="rounded-[16px] bg-panel p-4">
      <p className="text-[13px] text-gray-600">{label}</p>
      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.03em]">{wert}</p>
      {sub && <p className="mt-1.5 text-[12.5px] text-gray-600">{sub}</p>}
      {delta && <div className="mt-1">{delta}</div>}
    </div>
  );
}

/** Show-Quote als Halbkreis */
function Quote({ label, wert, ziel }: { label: string; wert: number | null; ziel: number }) {
  const v = wert ?? 0;
  const farbe = wert === null ? '#d5d0cd' : v >= ziel ? '#16a34a' : v >= ziel - 15 ? '#e8a317' : '#a3201a';
  const r = 46;
  const umfang = Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 70" className="w-[150px]" aria-hidden="true">
        <path d="M14 62 A46 46 0 0 1 106 62" fill="none" stroke="#efedeb" strokeWidth="12" strokeLinecap="round" />
        <path
          d="M14 62 A46 46 0 0 1 106 62"
          fill="none"
          stroke={farbe}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(umfang * Math.min(100, v)) / 100} ${umfang}`}
          style={{ transition: 'stroke-dasharray 1s cubic-bezier(.33,1,.68,1)' }}
        />
      </svg>
      <p className="-mt-7 text-[24px] font-semibold tracking-[-0.03em]">{pct(wert)}</p>
      <p className="mt-1 text-[12.5px] text-gray-600">
        {label} · Ziel {ziel} %
      </p>
    </div>
  );
}

export function VertriebClient() {
  const [zeitraum, setZeitraum] = useState('monat');
  const [d, setD] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [lädt, setLädt] = useState(true);

  const laden = useCallback(async (z: string, neu = false) => {
    setLädt(true);
    setFehler(null);
    try {
      const res = await fetch(`/api/admin/vertrieb?zeitraum=${z}${neu ? '&neu=1' : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Fehler');
      setD(data);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Daten konnten nicht geladen werden');
    } finally {
      setLädt(false);
    }
  }, []);

  useEffect(() => {
    let abbruch = false;
    fetch(`/api/admin/vertrieb?zeitraum=${zeitraum}`)
      .then(async (res) => {
        const data = await res.json();
        if (abbruch) return;
        if (!res.ok) setFehler(data.error ?? 'Fehler');
        else setD(data);
      })
      .catch(() => !abbruch && setFehler('Daten konnten nicht geladen werden'))
      .finally(() => !abbruch && setLädt(false));
    return () => {
      abbruch = true;
    };
  }, [zeitraum]);

  return (
    <div>
      <PageHeader
        title="Sales-Controlling"
        description="Ziel 300.000 € Auftragsvolumen pro Monat – Marketing, Setting, Closing und Forecast auf einen Blick."
        action={
          <div className="flex min-w-0 max-w-full items-center gap-2">
            <SegmentedControl
              className="min-w-0"
              items={[
                { value: 'monat', label: 'Dieser Monat' },
                { value: 'vormonat', label: 'Vormonat' },
                { value: 'quartal', label: 'Quartal' },
                { value: '90tage', label: '90 Tage' },
              ]}
              value={zeitraum}
              onChange={(v) => {
                setLädt(true);
                setZeitraum(v);
              }}
            />
            <Button variant="secondary" onClick={() => laden(zeitraum, true)} disabled={lädt} aria-label="Neu laden">
              {lädt ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            </Button>
          </div>
        }
      />

      {fehler && (
        <Card className="mb-4 flex items-start gap-3 text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
          <div>
            <p className="font-medium">Daten konnten nicht geladen werden</p>
            <p className="text-[13.5px]">{fehler}</p>
          </div>
        </Card>
      )}

      {!d ? (
        !fehler && (
          <div className="flex justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
          </div>
        )
      ) : (
        <div className={`space-y-4 transition-opacity ${lädt ? 'opacity-60' : ''}`}>
          <ZielBereich d={d} />
          <Rückwärts d={d} />
          <div className="grid gap-4 xl:grid-cols-2">
            <MarketingBereich d={d} />
            <Problemfelder d={d} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <SettingBereich d={d} />
            <ClosingBereich d={d} />
          </div>
          <Funnel d={d} />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <PipelineBereich d={d} />
            <Verlauf d={d} />
          </div>
          <Personen d={d} />
          <p className="px-1 text-[12px] text-gray-500">
            Quellen: Close (Pipeline „D2D Sales“, Statuswechsel) und Meta Ads{d.metaVerbunden ? '' : ' (nicht verbunden)'}. Auftragsvolumen = Wert neu gewonnener Deals, gezählt am Tag
            des Abschlusses. Stand: {new Date(d.stand).toLocaleString('de-DE')}.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Ziel ──────────────────────────────────────────────────────── */

function ZielBereich({ d }: { d: Daten }) {
  const z = d.ziel;
  const soll = Math.min(100, (z.sollBisHeute / z.ziel) * 100);
  const ist = Math.min(100, (z.erreicht / z.ziel) * 100);
  const aufKurs = z.aufKurs ?? 0;
  const status = aufKurs >= 100 ? 'Auf Kurs' : aufKurs >= 75 ? 'Leicht hinter Plan' : 'Deutlich hinter Plan';
  return (
    <Card hero padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-medium text-red-100">
            <Target className="h-4 w-4" /> Auftragsvolumen {new Date(`${z.monat}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
          </p>
          <p className="mt-3 text-[clamp(40px,5vw,64px)] font-semibold leading-none tracking-[-0.04em]">
            <CountUp value={z.erreicht} suffix=" €" />
          </p>
          <p className="mt-2 text-[15px] text-red-200">
            von {eur(z.ziel)} · {z.deals} Deal{z.deals === 1 ? '' : 's'} · Tag {z.vergangeneTage} von {z.tageImMonat}
          </p>
        </div>
        <span className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${aufKurs >= 100 ? 'bg-green-50 text-green-800' : aufKurs >= 75 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'}`}>
          {status} · {pct(z.aufKurs)}
        </span>
      </div>

      {/* Fortschritt mit Soll-Marke */}
      <div className="relative mt-6 h-3.5 rounded-full bg-white/15">
        <div className="h-full origin-left rounded-full bg-red-50" style={{ width: `${ist}%`, animation: 'fx-bar 1.1s cubic-bezier(.33,1,.68,1) .2s both' }} />
        <span className="absolute -top-1.5 h-6 w-0.5 rounded bg-amber-300" style={{ left: `${soll}%` }} title={`Soll bis heute: ${eur(z.sollBisHeute)}`} />
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-red-200">
        <span>{pct(z.prozent)} erreicht</span>
        <span>Soll bis heute {eur(z.sollBisHeute)}</span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: 'Hochrechnung (aktuelles Tempo)', v: eur(z.hochrechnung), s: `${pct((z.hochrechnung / z.ziel) * 100)} vom Ziel` },
          { l: 'Forecast inkl. Pipeline', v: eur(z.forecast), s: 'Ist + gewichtete abschlussnahe Deals' },
          { l: 'Fehlt bis Ziel', v: eur(z.rest), s: `${z.bedarfRest.deals} Deals à Ø ${eur(z.schnittDeal)}` },
          { l: 'Tempo vs. Bedarf', v: pct(z.tempoQuote), s: `${zahl(z.tempo90ProWoche.deals)} statt ${zahl(z.bedarfRestProWoche.deals)} Deals/Woche` },
        ].map((x) => (
          <div key={x.l} className="rounded-[16px] bg-white/10 p-4">
            <p className="text-[12.5px] text-red-200">{x.l}</p>
            <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em]">{x.v}</p>
            <p className="mt-1 text-[12px] text-red-200">{x.s}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── Rückwärtsrechnung ─────────────────────────────────────────── */

function Rückwärts({ d }: { d: Daten }) {
  const z = d.ziel;
  const zeilen: Array<{ label: string; key: keyof typeof z.bedarfRest; tempo: number | null; euro?: boolean }> = [
    { label: 'Abschlüsse (Deals)', key: 'deals', tempo: z.tempo90ProWoche.deals },
    { label: 'Closings gehalten', key: 'closingsGehalten', tempo: null },
    { label: 'Closings terminiert', key: 'closingsGebucht', tempo: z.tempo90ProWoche.closingsGebucht },
    { label: 'Settings gehalten', key: 'settingsGehalten', tempo: null },
    { label: 'Settings terminiert', key: 'settingsGebucht', tempo: z.tempo90ProWoche.settingsGebucht },
    { label: 'Anfragen / Leads', key: 'anfragen', tempo: z.tempo90ProWoche.anfragen },
    { label: 'Werbebudget', key: 'budget', tempo: null, euro: true },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-medium tracking-[-0.02em]">Was fehlt bis 300.000 €?</h2>
          <p className="mt-1 text-[13.5px] text-gray-600">
            Rückwärtsrechnung mit den Quoten der letzten 90 Tage: Abschluss im Closing {z.quoten.closingZuAbschluss} % · Closing-Show {z.quoten.closingShow} % ·
            Setting → Closing {z.quoten.settingZuClosing} % · Setting-Show {z.quoten.settingShow} % · Anfrage → Setting {z.quoten.anfrageZuSetting} %
            {z.kostenProAnfrage ? ` · ${eur(z.kostenProAnfrage)} pro Anfrage` : ''}
          </p>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-[14px]">
          <thead>
            <tr className="border-b border-hair text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
              <th className="pb-2.5">Stufe</th>
              <th className="pb-2.5 text-right">Für 300k / Monat</th>
              <th className="pb-2.5 text-right">Rest dieser Monat</th>
              <th className="pb-2.5 text-right">Nötig pro Woche</th>
              <th className="pb-2.5 text-right">Ist pro Woche (90 T.)</th>
              <th className="pb-2.5 text-right">Lücke</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((r) => {
              const nötig = z.bedarfRestProWoche[r.key];
              const lücke = r.tempo !== null && nötig !== null ? Math.max(0, nötig - r.tempo) : null;
              return (
                <tr key={r.key} className="border-b border-hair last:border-0">
                  <td className="py-2.5 font-medium">{r.label}</td>
                  <td className="py-2.5 text-right">{r.euro ? eur(z.bedarfVollerMonat[r.key]) : zahl(z.bedarfVollerMonat[r.key])}</td>
                  <td className="py-2.5 text-right">{r.euro ? eur(z.bedarfRest[r.key]) : zahl(z.bedarfRest[r.key])}</td>
                  <td className="py-2.5 text-right font-semibold">{r.euro ? eur(nötig) : zahl(nötig)}</td>
                  <td className="py-2.5 text-right">{r.tempo === null ? '–' : zahl(r.tempo)}</td>
                  <td className="py-2.5 text-right">
                    {lücke === null ? (
                      '–'
                    ) : lücke === 0 ? (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-[12px] font-semibold text-green-700">im Plan</span>
                    ) : (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[12px] font-semibold text-red-700">+{zahl(lücke)} / Woche</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ── Marketing ─────────────────────────────────────────────────── */

function MarketingBereich({ d }: { d: Daten }) {
  const m = d.marketing;
  const summe = m.quellen.reduce((s, q) => s + q.anzahl, 0) || 1;
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
        <Megaphone className="h-5 w-5 text-red-800" /> Marketing <span className="text-[13px] font-normal text-gray-500">· {d.zeitraum.label}</span>
      </h2>
      {!d.metaVerbunden && <p className="mt-1 text-[12.5px] text-amber-700">Meta Ads ist nicht verbunden – Kosten fehlen.</p>}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kennzahl label="Werbeausgaben" wert={eur(m.spend)} delta={<Delta jetzt={m.spend} vorher={m.vergleich.spend} invert einheit=" €" />} />
        <Kennzahl label="Meta-Leads" wert={zahl(m.metaLeads)} sub={`CPL ${eur(m.cpl, 2)}`} delta={<Delta jetzt={m.metaLeads} vorher={m.vergleich.metaLeads} />} />
        <Kennzahl label="Anfragen im CRM" wert={zahl(m.neueAnfragen)} sub={`${eur(m.kostenProAnfrage)} je Anfrage`} delta={<Delta jetzt={m.neueAnfragen} vorher={m.vergleich.neueAnfragen} />} />
        <Kennzahl label="Kosten je Setting" wert={eur(m.kostenProSetting)} />
        <Kennzahl label="Kosten je Kunde" wert={eur(m.kundenakquisekosten)} sub="Werbekosten ÷ Abschlüsse" />
        <Kennzahl label="ROAS" wert={m.roas === null ? '–' : `${zahl(m.roas)}×`} sub="Auftragsvolumen ÷ Werbekosten" />
      </div>
      <p className="mt-5 text-[13px] font-medium text-gray-600">Herkunft der Anfragen</p>
      <ul className="mt-2 space-y-2">
        {m.quellen.length === 0 && <li className="text-[13.5px] text-gray-500">Keine neuen Anfragen im Zeitraum.</li>}
        {m.quellen.map((q) => (
          <li key={q.quelle} className="flex items-center gap-3 text-[13.5px]">
            <span className="w-32 flex-none truncate">{q.quelle}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${q.quelle === 'Unbekannt' ? 'bg-gray-400' : 'bg-red-700'}`} style={{ width: `${(q.anzahl / summe) * 100}%` }} />
            </div>
            <span className="w-8 text-right font-semibold">{q.anzahl}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ── Setting / Closing ─────────────────────────────────────────── */

function SettingBereich({ d }: { d: Daten }) {
  const z = d.zahlen;
  const v = d.vergleich;
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
        <PhoneCall className="h-5 w-5 text-red-800" /> Setting
      </h2>
      <div className="mt-2 flex justify-center">
        <Quote label="Show-Quote" wert={z.settingShowQuote} ziel={70} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Kennzahl label="Terminiert" wert={zahl(z.settingGebucht)} delta={<Delta jetzt={z.settingGebucht} vorher={v.settingGebucht} />} />
        <Kennzahl label="Gehalten" wert={zahl(z.settingGehalten)} />
        <Kennzahl label="No-Shows" wert={zahl(z.settingNoShow)} sub={`No-Show-Quote ${pct(z.settingShowQuote === null ? null : 100 - z.settingShowQuote)}`} delta={<Delta jetzt={z.settingNoShow} vorher={v.settingNoShow} invert />} />
        <Kennzahl label="Weiter ins Closing" wert={pct(z.settingZuClosing)} sub="Closings ÷ gehaltene Settings" />
      </div>
    </Card>
  );
}

function ClosingBereich({ d }: { d: Daten }) {
  const z = d.zahlen;
  const v = d.vergleich;
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
        <TrendingUp className="h-5 w-5 text-red-800" /> Closing
      </h2>
      <div className="mt-2 flex justify-center">
        <Quote label="Show-Quote" wert={z.closingShowQuote} ziel={80} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Kennzahl label="Terminiert (inkl. CC2)" wert={zahl(z.closingGebucht)} delta={<Delta jetzt={z.closingGebucht} vorher={v.closingGebucht} />} />
        <Kennzahl label="Gehalten" wert={zahl(z.closingGehalten)} sub={`${zahl(z.angebote)} Angebote verschickt`} />
        <Kennzahl label="Abschlussquote" wert={pct(z.closingZuAbschluss)} sub={`${z.gewonnen} gewonnen · ${z.verloren} verloren`} />
        <Kennzahl label="Ø Deal" wert={eur(z.schnittDeal)} sub={z.zyklusTage !== null ? `Ø ${z.zyklusTage} Tage bis zum Abschluss` : undefined} />
      </div>
    </Card>
  );
}

/* ── Funnel ────────────────────────────────────────────────────── */

function Funnel({ d }: { d: Daten }) {
  const z = d.zahlen;
  const stufen = [
    { l: 'Anfragen', n: z.neueAnfragen },
    { l: 'Setting terminiert', n: z.settingGebucht },
    { l: 'Setting gehalten', n: z.settingGehalten },
    { l: 'Closing terminiert', n: z.closingGebucht },
    { l: 'Closing gehalten', n: z.closingGehalten },
    { l: 'Gewonnen', n: z.gewonnen },
  ];
  const max = Math.max(1, ...stufen.map((s) => s.n));
  return (
    <Card>
      <h2 className="text-[19px] font-medium tracking-[-0.02em]">Funnel · {d.zeitraum.label}</h2>
      <p className="mt-1 text-[13.5px] text-gray-600">Ereignisse im Zeitraum (Statuswechsel in Close). Prozent = Übergang zur vorherigen Stufe.</p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stufen.map((s, i) => {
          const vorher = i > 0 ? stufen[i - 1].n : null;
          const roh = vorher ? Math.round((s.n / vorher) * 100) : null;
          const quote = roh !== null && roh <= 100 ? roh : null;
          return (
            <div key={s.l} className="flex flex-col">
              <div className="flex h-[120px] items-end">
                <div
                  className={`w-full origin-bottom rounded-[14px] ${i === stufen.length - 1 ? 'bg-gradient-to-b from-red-700 to-red-950' : 'bg-red-200'}`}
                  style={{ height: `${Math.max(8, (s.n / max) * 100)}%`, animation: `fx-grow .9s cubic-bezier(.33,1,.68,1) ${i * 60}ms both` }}
                />
              </div>
              <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em]">{s.n}</p>
              <p className="text-[12.5px] text-gray-600">{s.l}</p>
              {quote !== null && <p className={`text-[12px] font-medium ${quote >= 50 ? 'text-green-700' : quote >= 30 ? 'text-amber-700' : 'text-red-700'}`}>{quote} %</p>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ── Problemfelder ─────────────────────────────────────────────── */

function Problemfelder({ d }: { d: Daten }) {
  const farbe = { kritisch: 'bg-red-50 text-red-800', wichtig: 'bg-amber-50 text-amber-800', hinweis: 'bg-gray-100 text-gray-700' };
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
        <AlertTriangle className="h-5 w-5 text-red-800" /> Problemfelder
      </h2>
      {d.probleme.length === 0 ? (
        <p className="mt-3 text-[14px] text-gray-600">Keine Auffälligkeiten im Zeitraum.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {d.probleme.map((p, i) => (
            <li key={i} className="rounded-[14px] bg-panel p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${farbe[p.stufe]}`}>{p.stufe}</span>
                <span className="text-[12px] text-gray-500">{p.bereich}</span>
              </div>
              <p className="mt-1.5 text-[14.5px] font-medium">{p.titel}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-gray-600">{p.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Pipeline ──────────────────────────────────────────────────── */

function PipelineBereich({ d }: { d: Daten }) {
  const p = d.pipeline;
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[19px] font-medium tracking-[-0.02em]">Offene Pipeline</h2>
        <p className="text-[13.5px] text-gray-600">
          {p.offenAnzahl} Deals · {eur(p.offenWert)} · gewichtet <strong className="text-ink">{eur(p.gewichtet)}</strong>
        </p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-[14px]">
          <thead>
            <tr className="border-b border-hair text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
              <th className="pb-2">Stufe</th>
              <th className="pb-2 text-right">Deals</th>
              <th className="pb-2 text-right">Wert</th>
              <th className="pb-2 text-right">Wahrsch.</th>
              <th className="pb-2 text-right">Gewichtet</th>
              <th className="pb-2 text-right">&gt; 14 T. still</th>
            </tr>
          </thead>
          <tbody>
            {p.proStufe.map((s) => (
              <tr key={s.stufe} className={`border-b border-hair last:border-0 ${s.anzahl === 0 ? 'text-gray-400' : ''}`}>
                <td className="py-2">{s.label}</td>
                <td className="py-2 text-right font-semibold">{s.anzahl}</td>
                <td className="py-2 text-right">{eur(s.wert)}</td>
                <td className="py-2 text-right">{s.wahrscheinlichkeit} %</td>
                <td className="py-2 text-right">{eur(s.gewichtet)}</td>
                <td className={`py-2 text-right ${s.ohneBewegung14Tage ? 'font-semibold text-red-700' : ''}`}>{s.ohneBewegung14Tage || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-[12px] text-gray-500">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-none" /> Wahrscheinlichkeit je Stufe aus den Abschlüssen der letzten 180 Tage (ab 5 Fällen), sonst Erfahrungswert.
      </p>
    </Card>
  );
}

/* ── Verlauf ───────────────────────────────────────────────────── */

function Verlauf({ d }: { d: Daten }) {
  const max = Math.max(d.ziel.ziel, ...d.verlauf.map((v) => v.auftragsvolumen));
  return (
    <Card>
      <h2 className="text-[19px] font-medium tracking-[-0.02em]">Auftragsvolumen je Monat</h2>
      <div className="relative mt-5 h-[200px]">
        <div className="absolute inset-x-0 border-t-2 border-dashed border-amber-400" style={{ bottom: `${(d.ziel.ziel / max) * 100}%` }}>
          <span className="absolute -top-5 right-0 text-[11px] font-medium text-amber-700">Ziel 300k</span>
        </div>
        <div className="grid h-full grid-cols-6 items-end gap-3">
          {d.verlauf.map((v, i) => (
            <div key={v.monat} className="flex h-full flex-col items-center justify-end gap-1.5" title={`${v.deals} Deals · Setting-Show ${pct(v.settingShowQuote)} · Closing-Show ${pct(v.closingShowQuote)}`}>
              <span className="text-[11.5px] font-semibold">{v.auftragsvolumen ? `${Math.round(v.auftragsvolumen / 1000)}k` : '0'}</span>
              <div
                className={`w-full max-w-[44px] origin-bottom rounded-[10px] ${v.auftragsvolumen >= d.ziel.ziel ? 'bg-green-600' : 'bg-gradient-to-b from-red-700 to-red-950'}`}
                style={{ height: `${Math.max(3, (v.auftragsvolumen / max) * 100)}%`, animation: `fx-grow .9s cubic-bezier(.33,1,.68,1) ${i * 60}ms both` }}
              />
              <span className="text-[11.5px] text-gray-500">{monatKurz(v.monat)}</span>
            </div>
          ))}
        </div>
      </div>
      <ul className="mt-4 space-y-1 text-[12.5px] text-gray-600">
        {d.verlauf.slice(-3).map((v) => (
          <li key={v.monat} className="flex justify-between">
            <span>{monatKurz(v.monat)}: {v.deals} Deals · {v.settingsGebucht} Settings · {v.closingsGebucht} Closings</span>
            <span>Spend {eur(v.spend)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ── Personen ──────────────────────────────────────────────────── */

function Personen({ d }: { d: Daten }) {
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
        <Users className="h-5 w-5 text-red-800" /> Setter & Closer · {d.zeitraum.label}
      </h2>
      <p className="mt-1 text-[13.5px] text-gray-600">Zuordnung über den Close-Nutzer, der den Status gesetzt bzw. den Deal gewonnen hat.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-[14px]">
          <thead>
            <tr className="border-b border-hair text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
              <th className="pb-2">Person</th>
              <th className="pb-2 text-right">Settings gehalten</th>
              <th className="pb-2 text-right">Setting-Show</th>
              <th className="pb-2 text-right">Closings gehalten</th>
              <th className="pb-2 text-right">Closing-Show</th>
              <th className="pb-2 text-right">Abschlüsse</th>
              <th className="pb-2 text-right">Quote</th>
              <th className="pb-2 text-right">Volumen</th>
            </tr>
          </thead>
          <tbody>
            {d.personen.length === 0 && (
              <tr>
                <td colSpan={8} className="py-3 text-gray-500">
                  Keine Aktivität im Zeitraum.
                </td>
              </tr>
            )}
            {d.personen.map((p) => (
              <tr key={p.user_id ?? 'ohne'} className="border-b border-hair last:border-0">
                <td className="py-2.5">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={p.name} size={32} />
                    {p.name}
                  </span>
                </td>
                <td className="py-2.5 text-right">{p.settingGehalten}</td>
                <td className="py-2.5 text-right">{pct(p.settingShowQuote)}</td>
                <td className="py-2.5 text-right">{p.closingGehalten}</td>
                <td className="py-2.5 text-right">{pct(p.closingShowQuote)}</td>
                <td className="py-2.5 text-right font-semibold">{p.gewonnen}</td>
                <td className="py-2.5 text-right">{pct(p.abschlussquote)}</td>
                <td className="py-2.5 text-right font-semibold">{eur(p.volumen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
