'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  STANDARD_ANNAHMEN,
  abschluesseFuerZiel,
  funnelBedarf,
  funnelQuoten,
  hochlauf,
  zielErreichtNach,
  type FunnelZahlen,
} from '@/lib/finanzen/prognose';
import { monateAb } from '@/lib/finanzen/cashplan';

const euro = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const pct = (v: number | null) => (v == null ? '–' : `${Math.round(v * 100)} %`);
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const label = (m: string) => `${MONATE[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

/** Hochlauf bis zum Umsatzziel + was es dafür im Funnel und an Kapazität braucht */
export function Hochlauf({
  abMonat,
  startMrr,
  ziel,
  standardAbschluesse,
  funnel,
  upsellsImFenster,
  kundenProKopf,
  fulfillmentKoepfe,
}: {
  abMonat: string;
  startMrr: number;
  ziel: number;
  standardAbschluesse: number;
  funnel: (Omit<FunnelZahlen, 'upsells'> & { tage: number }) | null;
  upsellsImFenster: number;
  kundenProKopf: number;
  fulfillmentKoepfe: number;
}) {
  const [eingabe, setEingabe] = useState(String(standardAbschluesse));
  const n = Math.max(0, Math.min(100, Number(eingabe.replace(',', '.')) || 0));
  const basis = { ...STANDARD_ANNAHMEN, startMrr };
  const monate = monateAb(abMonat, 24);
  const verlauf = hochlauf({ ...basis, abschluesseMonat: n }, 24);
  const erreicht = zielErreichtNach({ ...basis, abschluesseMonat: n }, ziel);
  const bisDez27 = monate.indexOf('2027-12') + 1;
  const noetig = bisDez27 > 0 ? abschluesseFuerZiel(basis, ziel, bisDez27) : null;
  const f = funnel ? { ...funnel, upsells: upsellsImFenster } : null;
  const q = f ? funnelQuoten(f) : null;
  const bedarf = f && q ? funnelBedarf(n, q, f) : null;
  // Aktive Kunden nach 12 Monaten (Einsteiger + Jahreskunden mit Churn) – für die Fulfillment-Kapazität
  const starter = n * STANDARD_ANNAHMEN.startquote;
  let aktiv12 = 0;
  for (let alter = 0; alter < 12; alter++)
    aktiv12 += alter < STANDARD_ANNAHMEN.einstiegMonate ? starter : starter * STANDARD_ANNAHMEN.upsellQuote * (1 - STANDARD_ANNAHMEN.churnUpsell) ** (alter - STANDARD_ANNAHMEN.einstiegMonate);
  const kapazitaet = kundenProKopf * fulfillmentKoepfe;
  const zeige = [2, 5, 8, 11, 13, 17, 23].filter((i) => i < verlauf.length);

  return (
    <div className="border-t border-gray-200 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Hochlauf: Abschlüsse pro Monat</span>
          <Input inputMode="numeric" className="w-28" value={eingabe} onChange={(e) => setEingabe(e.target.value)} />
        </label>
        <p className="pb-2 text-sm text-gray-700">
          {erreicht == null ? (
            <>Ziel {euro(ziel)} wird in 5 Jahren nicht erreicht.</>
          ) : (
            <>
              <span className="font-semibold">{euro(ziel)}</span> im Monat erreicht im <span className="font-semibold">{label(monate[erreicht] ?? '2029-01')}</span>
            </>
          )}
          {noetig ? <span className="text-gray-500"> · bis Dez 27 nötig: {noetig} Abschlüsse/Monat</span> : null}
        </p>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {zeige.map((i) => (
          <div key={i} className={`rounded-lg px-3 py-2 text-sm ${verlauf[i] >= ziel ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-800'}`}>
            <p className="text-xs text-gray-500">{label(monate[i])}</p>
            <p className="font-semibold">{euro(verlauf[i])}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Funnel letzte {funnel?.tage ?? 30} Tage → Bedarf für {n} Abschlüsse/Monat
          </p>
          {q && bedarf ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="py-1.5 text-gray-700">Leads (Kosten pro Lead {q.kostenProLead ? euro(q.kostenProLead) : '–'})</td>
                  <td className="py-1.5 text-right text-gray-500">{funnel?.leads}</td>
                  <td className="py-1.5 text-right font-semibold">{bedarf.leads}</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-gray-700">Settings gebucht → gehalten (Show {pct(q.showSetting)})</td>
                  <td className="py-1.5 text-right text-gray-500">{funnel?.settingsGebucht} → {funnel?.settingsGehalten}</td>
                  <td className="py-1.5 text-right font-semibold">{bedarf.settingsGebucht} → {bedarf.settingsGehalten}</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-gray-700">Closings gebucht (aus Settings {pct(q.settingZuClosing)}) → gehalten (Show {pct(q.showClosing)})</td>
                  <td className="py-1.5 text-right text-gray-500">{funnel?.closingsGebucht} → {funnel?.closingsGehalten}</td>
                  <td className="py-1.5 text-right font-semibold">{bedarf.closingsGebucht} → {bedarf.closingsGehalten}</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-gray-700">Neukunden-Abschlüsse (Closing-Quote {pct(q.closingQuote)})</td>
                  <td className="py-1.5 text-right text-gray-500">{Math.max(0, (funnel?.abschluesse ?? 0) - upsellsImFenster)}</td>
                  <td className="py-1.5 text-right font-semibold">{n}</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-gray-700">Werbung pro Monat</td>
                  <td className="py-1.5 text-right text-gray-500">{euro(funnel?.ausgaben ?? 0)}</td>
                  <td className="py-1.5 text-right font-semibold">{euro(bedarf.werbung)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-400">Noch keine Tageskennzahlen für den Funnel.</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Spalten: Ist letzte 30 Tage · Bedarf pro Monat. Upsells ({upsellsImFenster}) laufen nicht durchs Closing und sind abgezogen.
          </p>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Kapazität – damit es nicht kippt</p>
          <ul className="space-y-1.5 text-sm text-gray-700">
            <li>
              Gespräche im Sales: <span className="font-semibold">{bedarf ? `${bedarf.gespraecheProWerktag} pro Werktag` : '–'}</span>
              {bedarf && bedarf.gespraecheProWerktag > 5 ? <span className="text-amber-700"> – mehr als eine Person schafft (Setter/Closer einplanen)</span> : null}
            </li>
            <li>
              Aktive Kunden nach 12 Monaten (nur neue): <span className="font-semibold">≈ {Math.round(aktiv12)}</span> · Fulfillment-Kapazität:{' '}
              <span className="font-semibold">{kapazitaet}</span>
              {aktiv12 > kapazitaet * 0.8 ? <span className="text-amber-700"> – zweite Person im Fulfillment rechtzeitig einplanen</span> : null}
            </li>
            <li>
              Starts pro Monat im Onboarding: <span className="font-semibold">≈ {Math.round(starter)}</span>
            </li>
          </ul>
          <p className="mt-2 text-xs text-gray-500">
            Annahmen: {pct(STANDARD_ANNAHMEN.startquote)} starten, {pct(STANDARD_ANNAHMEN.upsellQuote)} buchen das Jahrespaket (Ø {euro(STANDARD_ANNAHMEN.upsellMonat)}/Monat), Churn danach{' '}
            {pct(STANDARD_ANNAHMEN.churnUpsell)}, Bestand {pct(STANDARD_ANNAHMEN.churnBestand)}.
          </p>
        </div>
      </div>
    </div>
  );
}
