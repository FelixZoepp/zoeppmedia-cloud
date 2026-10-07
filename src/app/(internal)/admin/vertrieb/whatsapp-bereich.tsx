'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import type { WirkungZeile } from '@/lib/sales/whatsapp-wirkung';

interface Daten {
  zeilen: WirkungZeile[];
  kundenErinnerung: { erinnert: number; erledigt3: number; quote: number | null };
}

const q = (x: number | null) => (x === null ? '–' : `${x} %`);

/** WhatsApp-Wirkung: gelesen, Antwort, Klick, Termin – je Nachrichtenart */
export function WhatsAppBereich({ zeitraum }: { zeitraum: string }) {
  const [d, setD] = useState<Daten | null>(null);
  useEffect(() => {
    let aktiv = true;
    fetch(`/api/admin/vertrieb/whatsapp?zeitraum=${zeitraum}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => aktiv && x && setD(x))
      .catch(() => {});
    return () => {
      aktiv = false;
    };
  }, [zeitraum]);

  if (!d) return null;
  return (
    <Card>
      <h3 className="text-[17px] font-medium">WhatsApp-Wirkung</h3>
      <p className="mt-1 text-[13px] text-gray-600">
        Automatische Nachrichten der Sales-Nummer: Wie viele werden gelesen, beantwortet, geklickt – und wie oft folgt binnen 7 Tagen ein gebuchter Termin?
      </p>
      {d.zeilen.length === 0 ? (
        <p className="mt-3 text-[14px] text-gray-500">Im Zeitraum keine automatischen Nachrichten.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13.5px]">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wide text-gray-500">
                <th className="py-1.5 pr-3 font-semibold">Nachricht</th>
                <th className="px-2 py-1.5 text-right font-semibold">Gesendet</th>
                <th className="px-2 py-1.5 text-right font-semibold">Gelesen</th>
                <th className="px-2 py-1.5 text-right font-semibold">Antwort</th>
                <th className="px-2 py-1.5 text-right font-semibold">Klicks</th>
                <th className="py-1.5 pl-2 text-right font-semibold">Termin danach</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {d.zeilen.map((z) => (
                <tr key={z.key}>
                  <td className="py-2 pr-3">
                    {z.label}
                    {z.fehlgeschlagen > 0 && <span className="ml-1.5 text-[12px] text-amber-700">{z.fehlgeschlagen} nicht zugestellt</span>}
                  </td>
                  <td className="px-2 py-2 text-right">{z.gesendet}</td>
                  <td className="px-2 py-2 text-right">{q(z.leseQuote)}</td>
                  <td className="px-2 py-2 text-right">{q(z.antwortQuote)}</td>
                  <td className="px-2 py-2 text-right">{z.klicks || '–'}</td>
                  <td className="py-2 pl-2 text-right">{z.key === 'buchung' ? <span className="text-gray-400">–</span> : `${q(z.terminQuote)} (${z.termine})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.kundenErinnerung.erinnert > 0 && (
        <p className="mt-3 text-[13.5px] text-gray-700">
          Kunden-Erinnerungen: {d.kundenErinnerung.erledigt3} von {d.kundenErinnerung.erinnert} erinnerten Aufgaben binnen 3 Tagen erledigt ({q(d.kundenErinnerung.quote)}).
        </p>
      )}
    </Card>
  );
}
