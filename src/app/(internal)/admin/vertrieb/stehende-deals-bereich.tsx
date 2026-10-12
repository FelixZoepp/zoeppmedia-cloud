'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import type { StehenderDeal } from '@/lib/sales/stehende-deals';

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Aktive Deals ohne Bewegung seit 7+ Tagen – jeder braucht einen Termin oder „Verloren“ */
export function StehendeDealsBereich() {
  const [d, setD] = useState<{ deals: StehenderDeal[]; aktiv: number; summe: number } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    let aktiv = true;
    fetch('/api/admin/vertrieb/stehende-deals', { cache: 'no-store' })
      .then(async (r) => {
        const x = await r.json();
        if (!r.ok) throw new Error(x.error ?? 'Fehler');
        if (aktiv) setD(x);
      })
      .catch((e) => aktiv && setFehler(e instanceof Error ? e.message : 'Fehler'));
    return () => {
      aktiv = false;
    };
  }, []);

  return (
    <Card>
      <h3 className="text-[17px] font-medium">🧊 Stehende Deals</h3>
      <p className="mt-1 text-[13px] text-gray-600">
        Aktive Opportunities ohne Anruf, Mail, Notiz oder Statuswechsel seit mindestens 7 Tagen. Jeder Deal bekommt einen nächsten Termin – oder wird in Close auf „Verloren“ gesetzt (mit Grund).
      </p>
      {fehler && <p className="mt-3 text-[14px] text-red-700">{fehler}</p>}
      {!d && !fehler && <p className="mt-3 text-[14px] text-gray-500">Lade aus Close …</p>}
      {d && d.deals.length === 0 && <p className="mt-3 text-[14px] text-gray-600">✅ Keine stehenden Deals – alle {d.aktiv} aktiven Deals sind in Bewegung.</p>}
      {d && d.deals.length > 0 && (
        <>
          <p className="mt-3 text-[15px]">
            <span className="font-semibold text-red-700">{d.deals.length}</span> von {d.aktiv} aktiven Deals stehen · <span className="font-semibold">{eur(d.summe)}</span> Pipeline
            {d.deals.filter((x) => !x.naechsterSchritt).length > 0 && <span className="text-gray-500"> · {d.deals.filter((x) => !x.naechsterSchritt).length} ohne offene Aufgabe</span>}
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead>
                <tr className="text-left text-[12.5px] uppercase tracking-wide text-gray-500">
                  <th className="py-1 pr-2 font-semibold">Firma</th>
                  <th className="py-1 pr-2 font-semibold">Status</th>
                  <th className="py-1 pr-2 text-right font-semibold">Wert</th>
                  <th className="py-1 pr-2 text-right font-semibold">Tage</th>
                  <th className="py-1 font-semibold">Nächster Schritt</th>
                </tr>
              </thead>
              <tbody>
                {d.deals.map((x) => (
                  <tr key={x.oppId} className="border-t border-gray-100 align-top">
                    <td className="py-1.5 pr-2">
                      <a href={`https://app.close.com/lead/${x.leadId}/`} target="_blank" rel="noreferrer" className="hover:text-red-700">
                        {x.firma}
                      </a>
                      {x.verantwortlich && <span className="block text-[12px] text-gray-500">{x.verantwortlich}</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-gray-600">{x.status}</td>
                    <td className="py-1.5 pr-2 text-right">{eur(x.wert)}</td>
                    <td className={`py-1.5 pr-2 text-right ${x.tage >= 21 ? 'font-semibold text-red-700' : x.tage >= 14 ? 'text-amber-700' : ''}`}>{x.tage}</td>
                    <td className="py-1.5 text-gray-600">{x.naechsterSchritt ?? <span className="text-red-700">keine Aufgabe</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
