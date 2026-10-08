'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, Info } from 'lucide-react';
import { Card, PageHeader, SegmentedControl } from '@/components/ui';
import type { UmsatzAnalyse } from '@/lib/umsatz/berechnung';

const UmsatzChart = dynamic(() => import('./umsatz-chart').then((m) => m.UmsatzChart), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded-xl bg-panel" />,
});

type Daten = UmsatzAnalyse & { auswahl: string; label: string };

const eur = (n: number | null | undefined) => (n == null ? '–' : `${Math.round(n).toLocaleString('de-DE')} €`);
const pct = (n: number | null | undefined) => (n == null ? '–' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`);

function Kachel({ titel, wert, note }: { titel: string; wert: string; note?: React.ReactNode }) {
  return (
    <Card>
      <p className="text-[12.5px] font-medium text-gray-500">{titel}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{wert}</p>
      {note && <p className="mt-1 text-[12.5px] text-gray-500">{note}</p>}
    </Card>
  );
}

function Anteile({ titel, zeilen, hinweis }: { titel: string; zeilen: Array<{ key: string; label: string; betrag: number; anteil: number }>; hinweis?: string }) {
  return (
    <Card>
      <h3 className="mb-3 font-semibold text-ink">{titel}</h3>
      {zeilen.length === 0 ? (
        <p className="text-[13.5px] text-gray-500">Keine Rechnungen im Zeitraum.</p>
      ) : (
        <ul className="space-y-2.5">
          {zeilen.map((z) => (
            <li key={z.key}>
              <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                <span className="min-w-0 truncate text-ink">{z.label}</span>
                <span className="flex-none tabular-nums text-gray-600">
                  {eur(z.betrag)} · {pct(z.anteil)}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-red-50">
                <div className="h-1.5 rounded-full bg-red-700" style={{ width: `${Math.min(100, z.anteil)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {hinweis && <p className="mt-3 text-[12px] text-gray-500">{hinweis}</p>}
    </Card>
  );
}

export function UmsatzClient() {
  const [auswahl, setAuswahl] = useState('12m');
  const [d, setD] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let abbruch = false;
    fetch(`/api/admin/umsatz?zeitraum=${auswahl}`)
      .then(async (res) => {
        const data = await res.json();
        if (abbruch) return;
        if (!res.ok) {
          setFehler(data.error ?? 'Fehler');
          setD(null);
        } else {
          setFehler(null);
          setD(data);
        }
      })
      .catch(() => !abbruch && setFehler('Daten konnten nicht geladen werden'));
    return () => {
      abbruch = true;
    };
  }, [auswahl]);

  return (
    <div>
      <PageHeader
        title="Umsatz-Analyse"
        description="Woher der Umsatz kommt, wie er entsteht und wie viel davon Bestandskunden bringen – aus den Lexware-Rechnungen."
        action={
          <SegmentedControl
            className="min-w-0"
            items={[
              { value: 'monat', label: 'Dieser Monat' },
              { value: 'quartal', label: 'Dieses Quartal' },
              { value: 'jahr', label: 'Jahr' },
              { value: '12m', label: '12 Monate' },
            ]}
            value={auswahl}
            onChange={(v) => {
              setD(null);
              setAuswahl(v);
            }}
          />
        }
      />

      {fehler && (
        <Card className="mb-4 flex items-start gap-3 text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
          <div>
            <p className="font-medium">Umsatz konnte nicht geladen werden</p>
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
        <div className="space-y-4">
          {!d.abgleich.closeVerbunden && (
            <Card className="flex items-start gap-3 text-[13.5px] text-amber-800">
              <Info className="mt-0.5 h-4 w-4 flex-none" />
              Close ist nicht erreichbar – Leadquellen, Upsell aus neuen Deals und der Abgleich mit dem Auftragsvolumen fehlen.
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kachel
              titel={`Umsatz netto · ${d.label}`}
              wert={eur(d.summen.gestellt)}
              note={d.summen.veraenderung == null ? `${d.summen.rechnungen} Rechnungen` : `${d.summen.veraenderung > 0 ? '+' : ''}${pct(d.summen.veraenderung)} zur Vorperiode`}
            />
            <Kachel titel="Davon bezahlt" wert={eur(d.summen.bezahlt)} note={`offen: ${eur(d.summen.offen)}`} />
            <Kachel titel="MRR (laufender Monatsumsatz)" wert={eur(d.kennzahlen.mrr)} note={`${d.kennzahlen.kundenMitMrr} von ${d.kennzahlen.aktiveKunden} aktiven Kunden`} />
            <Kachel titel="Ø Umsatz pro Kunde" wert={eur(d.kennzahlen.schnittProKunde)} note={`${d.kunden.anzahl} Kunden mit Rechnung`} />
          </div>

          <Card>
            <h3 className="mb-1 font-semibold text-ink">Umsatz pro Monat</h3>
            <p className="mb-3 text-[12.5px] text-gray-500">Netto, aufgeteilt nach Neukunden, Upsell/Verlängerung und Bestandskunden</p>
            <div className="h-64">
              <UmsatzChart daten={d.verlauf} />
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-[12.5px]">
                <thead className="text-left text-gray-500">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Monat</th>
                    <th className="py-1 pr-3 text-right font-medium">Gestellt</th>
                    <th className="py-1 pr-3 text-right font-medium">Bezahlt</th>
                    <th className="py-1 pr-3 text-right font-medium">Offen</th>
                    <th className="py-1 text-right font-medium">Rechnungen</th>
                  </tr>
                </thead>
                <tbody>
                  {[...d.verlauf].reverse().map((m) => (
                    <tr key={m.monat} className="border-t border-gray-100">
                      <td className="py-1.5 pr-3">{new Date(`${m.monat}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{eur(m.gestellt)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{eur(m.bezahlt)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{m.offen > 0 ? eur(m.offen) : '–'}</td>
                      <td className="py-1.5 text-right tabular-nums">{m.rechnungen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Anteile
              titel="Neu- oder Bestandskunde"
              zeilen={d.kundenart}
              hinweis="Neukunde: Rechnung in den ersten 30 Tagen ab erster Rechnung bzw. Vertragsstart. Upsell/Verlängerung: Bestandskunde mit Zusatzleistung, höherem Monatsbetrag oder neuem gewonnenen Deal in Close."
            />
            <Anteile titel="Wie der Umsatz entsteht" zeilen={d.art} hinweis="Setup, laufender Monatsbetrag, Upsell/Zusatzleistung – aus Rechnungsliste, Positionstexten und Vertragsbeträgen." />
            <Anteile titel="Woher er kommt (Leadquelle des Kunden)" zeilen={d.quelle} hinweis="Quelle des ursprünglich gewonnenen Close-Deals des Kunden." />
            <Anteile titel="Nach Paket" zeilen={d.paket} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="mb-1 font-semibold text-ink">Top-Kunden</h3>
              <p className={`mb-3 text-[12.5px] ${d.kunden.konzentrationsrisiko ? 'font-medium text-red-700' : 'text-gray-500'}`}>
                Top 3 = {pct(d.kunden.top3Anteil)} des Umsatzes{d.kunden.konzentrationsrisiko ? ' – Klumpenrisiko' : ''}
              </p>
              <ul className="space-y-1.5 text-[13.5px]">
                {d.kunden.liste.map((k, i) => (
                  <li key={k.key} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {i + 1}. {k.label}
                    </span>
                    <span className="flex-none tabular-nums text-gray-600">
                      {eur(k.betrag)} · {pct(k.anteil)}
                    </span>
                  </li>
                ))}
              </ul>
              {d.ohneZuordnung > 0 && <p className="mt-3 text-[12px] text-gray-500">{eur(d.ohneZuordnung)} aus Rechnungen ohne Kunden-Zuordnung (Lexware-Kontakt nicht verknüpft).</p>}
            </Card>

            <Card>
              <h3 className="mb-3 font-semibold text-ink">Kunden & Abwanderung</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13.5px]">
                <div>
                  <dt className="text-gray-500">Ø Kundendauer bisher</dt>
                  <dd className="font-medium">{d.kennzahlen.lebensdauerMonate == null ? '–' : `${d.kennzahlen.lebensdauerMonate.toLocaleString('de-DE')} Monate`}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Umsatz aus Verlängerungen</dt>
                  <dd className="font-medium">
                    {eur(d.kennzahlen.umsatzVerlaengert)} <span className="text-gray-500">({d.kennzahlen.kundenVerlaengert} Kunden)</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Abgewanderte Kunden</dt>
                  <dd className="font-medium">{d.kennzahlen.abwanderung.kunden}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Entgangener MRR</dt>
                  <dd className="font-medium text-red-700">{eur(d.kennzahlen.abwanderung.entgangenerMrr)}</dd>
                </div>
              </dl>
              {d.kennzahlen.abwanderung.namen.length > 0 && <p className="mt-3 text-[12px] text-gray-500">{d.kennzahlen.abwanderung.namen.join(', ')}</p>}
            </Card>
          </div>

          {d.abgleich.closeVerbunden && (
            <Card>
              <h3 className="mb-1 font-semibold text-ink">Auftragsvolumen vs. Rechnungen</h3>
              <p className="mb-3 text-[12.5px] text-gray-500">In Close gewonnen im Zeitraum gegenüber dem Neukunden-Umsatz in Lexware</p>
              <div className="grid grid-cols-3 gap-3 text-[13.5px]">
                <div>
                  <p className="text-gray-500">Gewonnen (Close)</p>
                  <p className="text-lg font-semibold">{eur(d.abgleich.gewonnen)}</p>
                  <p className="text-[12px] text-gray-500">{d.abgleich.deals} Deals</p>
                </div>
                <div>
                  <p className="text-gray-500">Neukunden-Umsatz</p>
                  <p className="text-lg font-semibold">{eur(d.abgleich.neukundenUmsatz)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Davon fakturiert</p>
                  <p className="text-lg font-semibold">{pct(d.abgleich.quote)}</p>
                </div>
              </div>
              {d.abgleich.ohneRechnung.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-[12.5px] font-medium text-gray-600">Gewonnen, aber noch keine Rechnung gefunden</p>
                  <ul className="space-y-1 text-[13px]">
                    {d.abgleich.ohneRechnung.map((a) => (
                      <li key={`${a.name}-${a.datum}`} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">{a.name}</span>
                        <span className="flex-none tabular-nums text-gray-600">
                          {eur(a.wert)} · {new Date(`${a.datum}T12:00:00`).toLocaleDateString('de-DE')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {d.nettoGeschaetzt > 0 && (
            <p className="text-[12px] text-gray-500">
              Bei {d.nettoGeschaetzt} älteren Rechnungen ist der Nettobetrag geschätzt (brutto ÷ 1,19), weil die Rechnungsdetails aus Lexware noch nicht geladen sind.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
