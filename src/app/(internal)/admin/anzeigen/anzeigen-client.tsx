'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, Card, PageHeader } from '@/components/ui';
import type { AnzeigeZeile, AnzeigenStatus } from '@/lib/marketing/anzeigen';

interface Daten {
  zeilen: AnzeigeZeile[];
  summe: Omit<AnzeigeZeile, 'schluessel' | 'name' | 'kampagne' | 'aktiv' | 'status' | 'grund'>;
  schnittCpl: number | null;
  von: string;
  bis: string;
  metaVerbunden: boolean;
}

const eur = (n: number | null) => (n === null ? '–' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: n < 100 ? 2 : 0 }));
const pz = (n: number | null) => (n === null ? '–' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`);
const z = (n: number) => n.toLocaleString('de-DE');

const STATUS: Record<AnzeigenStatus, { label: string; cls: string }> = {
  gewinner: { label: '🏆 Gewinner', cls: 'bg-green-50 text-green-700' },
  verlierer: { label: '🔥 Verbrennt Geld', cls: 'bg-red-50 text-red-700' },
  test: { label: '🧪 Im Test', cls: 'bg-gray-100 text-gray-700' },
  ohne_daten: { label: '💤 Keine Ausgaben', cls: 'bg-gray-50 text-gray-400' },
};

export function AnzeigenClient() {
  const [tage, setTage] = useState(30);
  const [d, setD] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  const laden = useCallback(async (t: number) => {
    setLaedt(true);
    const r = await fetch(`/api/admin/anzeigen?tage=${t}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      setD(j);
      setFehler(null);
    } else setFehler(j.error ?? 'Konnte nicht geladen werden');
    setLaedt(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => laden(tage), 0);
    return () => clearTimeout(t);
  }, [laden, tage]);

  const kachel = (titel: string, wert: string, sub?: string) => (
    <Card padding="none" className="p-4">
      <p className="text-xs text-gray-500">{titel}</p>
      <p className="text-xl font-bold text-gray-900">{wert}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </Card>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        label="MARKETING"
        title="Anzeigen"
        description="Welche Anzeige bringt Leads, Termine und Abschlüsse – und welche verbrennt Geld?"
        action={
          <div className="flex gap-2">
            {[7, 14, 30, 90].map((t) => (
              <button key={t} onClick={() => setTage(t)} className={`h-9 rounded-full px-3 text-xs font-semibold ${tage === t ? 'bg-red-600 text-white' : 'border border-gray-200 bg-white text-gray-700'}`}>
                {t} Tage
              </button>
            ))}
            <Button variant="secondary" onClick={() => laden(tage)} disabled={laedt}>
              <RefreshCw className={`h-4 w-4 ${laedt ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />
      {fehler && <Card padding="none" className="p-4 text-sm text-red-700">{fehler}</Card>}
      {!d && !fehler && (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-600" />
        </div>
      )}
      {d && (
        <>
          {!d.metaVerbunden && <Card padding="none" className="p-4 text-sm text-amber-800 bg-amber-50">⚠️ Meta Ads nicht verbunden (META_ACCESS_TOKEN / META_AD_ACCOUNT_ID) – nur Leads aus dem Funnel sichtbar.</Card>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {kachel('💸 Ausgaben', eur(d.summe.ausgaben), `gestern ${eur(d.summe.ausgabenGestern)}`)}
            {kachel('🧲 Leads', z(d.summe.leads), `Ø ${eur(d.summe.cpl)} pro Lead`)}
            {kachel('🗓️ Termine', z(d.summe.termine), `${eur(d.summe.kostenProTermin)} pro Termin`)}
            {kachel('🤝 Closings', z(d.summe.closings))}
            {kachel('🏆 Abschlüsse', z(d.summe.abschluesse), `${eur(d.summe.kostenProAbschluss)} pro Abschluss`)}
            {kachel('💰 Umsatz / ROAS', eur(d.summe.umsatz), d.summe.roas === null ? '' : `${d.summe.roas.toLocaleString('de-DE', { maximumFractionDigits: 1 })}× Werbebudget`)}
          </div>
          <Card padding="none" className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2">Anzeige</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Ausgaben</th>
                  <th className="px-3 py-2 text-right">Leads</th>
                  <th className="px-3 py-2 text-right">€/Lead</th>
                  <th className="px-3 py-2 text-right">Termine</th>
                  <th className="px-3 py-2 text-right">€/Termin</th>
                  <th className="px-3 py-2 text-right">Abschl.</th>
                  <th className="px-3 py-2 text-right">Umsatz</th>
                  <th className="px-3 py-2 text-right">CTR</th>
                  <th className="px-3 py-2 text-right">Hook-Rate</th>
                </tr>
              </thead>
              <tbody>
                {d.zeilen.map((x) => (
                  <tr key={x.schluessel} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-gray-900">{x.name}{x.aktiv && <span className="ml-1.5 text-[10px] font-semibold text-green-600">● läuft</span>}</p>
                      {x.kampagne && <p className="text-[11px] text-gray-400">{x.kampagne}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS[x.status].cls}`}>{STATUS[x.status].label}</span>
                      <p className="mt-0.5 text-[11px] text-gray-500">{x.grund}</p>
                    </td>
                    <td className="px-3 py-2 text-right">{eur(x.ausgaben)}</td>
                    <td className="px-3 py-2 text-right">{z(x.leads)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{eur(x.cpl)}</td>
                    <td className="px-3 py-2 text-right">{z(x.termine)}</td>
                    <td className="px-3 py-2 text-right">{eur(x.kostenProTermin)}</td>
                    <td className="px-3 py-2 text-right">{z(x.abschluesse)}</td>
                    <td className="px-3 py-2 text-right">{x.umsatz ? eur(x.umsatz) : '–'}</td>
                    <td className="px-3 py-2 text-right">{pz(x.ctr)}</td>
                    <td className="px-3 py-2 text-right">{pz(x.hookRate)}</td>
                  </tr>
                ))}
                {!d.zeilen.length && (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-gray-500">Keine Anzeigen im Zeitraum.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
          <p className="text-[11px] text-gray-500">
            Zuordnung Lead → Anzeige über utm_content (= Anzeigenname im Funnel-Link). Leads vor dem 09.10. haben teils keine Zuordnung. Gewinner: ≥ 3 Leads und ≥ 20 % günstiger als der Schnitt ·
            Verbrennt Geld: ≥ 50 % teurer als der Schnitt oder doppelter Schnitt ohne Lead. Hook-Rate = 3-Sekunden-Views / Impressionen.
          </p>
        </>
      )}
    </div>
  );
}
