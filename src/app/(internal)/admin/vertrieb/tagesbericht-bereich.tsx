'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Info, Loader2, RefreshCw } from 'lucide-react';
import { Button, Card, SegmentedControl } from '@/components/ui';
import type { Tagesbericht } from '@/lib/sales-controlling/tagesbericht';

type Daten = Tagesbericht & { protokolleVerbunden: boolean; stand: string };
type Zeile = Daten['summe'];

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pct = (n: number | null) => (n === null ? '–' : `${n.toLocaleString('de-DE')} %`);
const zahl = (n: number) => (n ? String(n) : '–');

/** Spalten wie in den bisherigen Monday-Dashboards (Kaltakquise, Sales-Pipeline, Marketing) */
const SPALTEN: Array<{ gruppe: string; label: string; wert: (z: Zeile) => string; warn?: (z: Zeile) => boolean }> = [
  { gruppe: 'Telefonie', label: 'Anwahlen', wert: (z) => zahl(z.anwahlen) },
  { gruppe: 'Telefonie', label: 'Gespräche', wert: (z) => zahl(z.gespraeche) },
  { gruppe: 'Telefonie', label: 'Entscheider', wert: (z) => zahl(z.entscheider) },
  { gruppe: 'Telefonie', label: 'Erreichbarkeit', wert: (z) => pct(z.quoten.erreichbarkeit) },
  { gruppe: 'Telefonie', label: 'Protokolle fehlen', wert: (z) => zahl(z.protokolleFehlen), warn: (z) => z.protokolleFehlen > 0 },
  { gruppe: 'Setting', label: 'Gebucht', wert: (z) => zahl(z.settingsGebucht) },
  { gruppe: 'Setting', label: 'Gehalten', wert: (z) => zahl(z.settingsGehalten) },
  { gruppe: 'Setting', label: 'No-Show', wert: (z) => zahl(z.settingsNoShow), warn: (z) => z.settingsNoShow > 0 },
  { gruppe: 'Setting', label: 'Show-up', wert: (z) => pct(z.quoten.showUpSetting) },
  { gruppe: 'Setting', label: 'Unqualif.', wert: (z) => zahl(z.settingsUnqualifiziert) },
  { gruppe: 'Closing', label: 'Gebucht', wert: (z) => zahl(z.closingsGebucht) },
  { gruppe: 'Closing', label: 'Gehalten', wert: (z) => zahl(z.closingsGehalten) },
  { gruppe: 'Closing', label: 'No-Show', wert: (z) => zahl(z.closingsNoShow), warn: (z) => z.closingsNoShow > 0 },
  { gruppe: 'Closing', label: 'Show-up', wert: (z) => pct(z.quoten.showUpClosing) },
  { gruppe: 'Abschluss', label: 'Abschlüsse', wert: (z) => zahl(z.abschluesse) },
  { gruppe: 'Abschluss', label: 'Closing-Rate', wert: (z) => pct(z.quoten.closingRate) },
  { gruppe: 'Abschluss', label: 'Volumen', wert: (z) => (z.volumen ? eur(z.volumen) : '–') },
  { gruppe: 'Marketing', label: 'Eintragungen', wert: (z) => zahl(z.eintragungen) },
  { gruppe: 'Marketing', label: 'Direkt gebucht', wert: (z) => pct(z.quoten.direktQuote) },
];

const GRUPPEN = [...new Set(SPALTEN.map((s) => s.gruppe))];

/** Tagesbericht Vertrieb – ersetzt die täglichen Make-Exporte nach Monday */
export function TagesberichtBereich() {
  const [tage, setTage] = useState('14');
  const [d, setD] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [lädt, setLädt] = useState(true);

  const holen = (t: string, neu: boolean) =>
    fetch(`/api/admin/vertrieb/tagesbericht?tage=${t}${neu ? '&neu=1' : ''}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Fehler');
        setD(j);
        setFehler(null);
      })
      .catch((e) => setFehler(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLädt(false));

  useEffect(() => {
    void holen(tage, false);
  }, [tage]);

  const laden = (t: string, neu = false) => {
    setLädt(true);
    void holen(t, neu);
  };

  const tag = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[19px] font-medium tracking-[-0.02em]">Tagesbericht</h2>
          <p className="text-[13.5px] text-gray-600">Alle Zahlen je Tag direkt aus Close – Telefonie, Setting, Closing, Abschlüsse und Eintragungen.</p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            items={[
              { value: '7', label: '7 Tage' },
              { value: '14', label: '14 Tage' },
              { value: '31', label: '31 Tage' },
            ]}
            value={tage}
            onChange={(v) => {
              setLädt(true);
              setTage(v);
            }}
          />
          <Button variant="secondary" onClick={() => laden(tage, true)} disabled={lädt} aria-label="Neu laden">
            {lädt ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
        </div>
      </div>

      {fehler && (
        <p className="mt-3 flex items-start gap-1.5 text-[13.5px] text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /> {fehler}
        </p>
      )}

      {!d ? (
        !fehler && (
          <div className="flex justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
          </div>
        )
      ) : (
        <div className={lädt ? 'opacity-60' : ''}>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[1100px] text-[13.5px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                  <th />
                  {GRUPPEN.map((g) => (
                    <th key={g} colSpan={SPALTEN.filter((s) => s.gruppe === g).length} className="border-l border-hair pb-1 pl-2">
                      {g}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-hair text-left text-[11.5px] font-medium text-gray-500">
                  <th className="sticky left-0 bg-white pb-2 pr-3">Tag</th>
                  {SPALTEN.map((s, i) => (
                    <th key={i} className={`pb-2 pl-2 text-right ${i === 0 || SPALTEN[i - 1].gruppe !== s.gruppe ? 'border-l border-hair' : ''}`}>
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[{ ...d.summe, tag: 'Summe' }, ...d.tage].map((z) => (
                  <tr key={z.tag} className={`border-b border-hair last:border-0 ${z.tag === 'Summe' ? 'bg-gray-50 font-semibold' : ''}`}>
                    <td className={`sticky left-0 py-1.5 pr-3 whitespace-nowrap ${z.tag === 'Summe' ? 'bg-gray-50' : 'bg-white'}`}>{z.tag === 'Summe' ? 'Summe' : tag(z.tag)}</td>
                    {SPALTEN.map((s, i) => (
                      <td
                        key={i}
                        className={`py-1.5 pl-2 text-right tabular-nums ${i === 0 || SPALTEN[i - 1].gruppe !== s.gruppe ? 'border-l border-hair' : ''} ${s.warn?.(z) ? 'text-red-700' : ''}`}
                      >
                        {s.wert(z)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {d.fehlendeProtokolleJePerson.length > 0 && (
            <div className="mt-4">
              <p className="text-[12.5px] font-semibold uppercase tracking-wide text-gray-500">Fehlende Gesprächsprotokolle je Person</p>
              <ul className="mt-1 flex flex-wrap gap-2 text-[13.5px]">
                {d.fehlendeProtokolleJePerson.map((p) => (
                  <li key={p.name} className="rounded-full bg-red-50 px-2.5 py-0.5 text-red-800">
                    {p.name}: {p.anzahl}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!d.protokolleVerbunden && (
            <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" /> Gesprächsprotokolle konnten nicht geladen werden – „Entscheider“, „Unqualifiziert“ und „Protokolle fehlen“ sind unvollständig.
            </p>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-[12px] text-gray-500">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-none" />
            Gespräch = angenommener Anruf ab 30 Sek. Entscheider = Cold-Call-Protokoll mit Entscheider-Ergebnis oder Follow-up-Protokoll mit Ergebnis. Protokoll fehlt = Gespräch ohne
            Gesprächsprotokoll am selben Lead und Tag. Setting/Closing aus den Statuswechseln in „D2D Sales“, Abschlüsse am Abschlussdatum. Stand:{' '}
            {new Date(d.stand).toLocaleString('de-DE')}.
          </p>
        </div>
      )}
    </Card>
  );
}
