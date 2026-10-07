'use client';

import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import type { EintragungsZahlen } from '@/lib/sales/eintragungen';

interface Daten {
  zahlen: EintragungsZahlen;
  offen: Array<{ lead_id: string; name: string | null; quelle: string | null; eingetragen_am: string }>;
}

interface Quellen {
  gesamt: number;
  automatisch: number;
  ohneQuelle: Array<{ id: string; name: string; erstellt: string }>;
}

/** Eintragung → Termin: direkt gebucht, kein Termin nach 10 Min., später gebucht (Speed-to-Lead) */
export function EintragungenBereich({ zeitraum }: { zeitraum: string }) {
  const [d, setD] = useState<Daten | null>(null);
  const [q, setQ] = useState<Quellen | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/admin/vertrieb/leadquellen', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => x && setQ(x))
      .catch(() => {});
  }, []);

  const nachtragen = async () => {
    setLaeuft(true);
    setMeldung(null);
    try {
      const r = await fetch('/api/admin/vertrieb/leadquellen', { method: 'POST' });
      const x = await r.json();
      if (!r.ok) throw new Error(x.error ?? 'Fehler');
      setMeldung(`${x.gesetzt.length} Leadquellen aus UTM-Daten gesetzt.`);
      setQ({ gesamt: x.gesamt, automatisch: 0, ohneQuelle: x.ohneQuelle });
    } catch (err) {
      setMeldung(err instanceof Error ? err.message : 'Fehler');
    } finally {
      setLaeuft(false);
    }
  };

  useEffect(() => {
    let aktiv = true;
    fetch(`/api/admin/vertrieb/eintragungen?zeitraum=${zeitraum}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => aktiv && x && setD(x))
      .catch(() => {});
    return () => {
      aktiv = false;
    };
  }, [zeitraum]);

  if (!d) return null;
  const z = d.zahlen;
  const kachel = (label: string, wert: string, unter?: string) => (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
      <p className="text-[12.5px] text-gray-500">{label}</p>
      <p className="text-[22px] font-semibold leading-tight">{wert}</p>
      {unter && <p className="text-[12px] text-gray-500">{unter}</p>}
    </div>
  );
  return (
    <Card>
      <h3 className="text-[17px] font-medium">Eintragung → Termin</h3>
      <p className="mt-1 text-[13px] text-gray-600">
        Neue Funnel-Leads in Close: Wer bucht sich selbst einen Termin, wer nicht? Ohne Buchung nach 10 Minuten entsteht in Close die Aufgabe „Jetzt anrufen“. Von Hand angelegte Leads zählen nicht mit und bekommen keine Aufgabe.
      </p>
      {z.eintragungen === 0 ? (
        <p className="mt-3 text-[14px] text-gray-500">Noch keine Eintragungen im Zeitraum – die Erfassung läuft seit heute.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {kachel('Eintragungen', String(z.eintragungen))}
            {kachel('Direkt gebucht (≤ 10 Min.)', z.direktQuote === null ? '–' : `${z.direktQuote} %`, `${z.direkt} Leads`)}
            {kachel('Kein Termin nach 10 Min.', z.nichtGebucht10Quote === null ? '–' : `${z.nichtGebucht10Quote} %`, `${z.nichtGebucht10} Leads · davon ${z.spaeter} später gebucht`)}
            {kachel('Ø bis zur Buchung', z.medianMinBisBuchung === null ? '–' : `${z.medianMinBisBuchung} Min.`, 'Median')}
          </div>
          {z.quellen.length > 0 && (
            <div className="mt-3">
              <p className="text-[12.5px] font-semibold uppercase tracking-wide text-gray-500">Nach Leadquelle</p>
              <ul className="mt-1 space-y-1 text-[14px]">
                {z.quellen.map((x) => (
                  <li key={x.quelle} className="flex justify-between gap-2">
                    <span className="truncate">{x.quelle}</span>
                    <span className="text-gray-500">
                      {x.eintragungen} · {x.direktQuote ?? '–'} % direkt gebucht
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {z.manuell > 0 && <p className="mt-2 text-[12.5px] text-gray-500">{z.manuell} von Hand angelegte Leads nicht mitgezählt.</p>}
          {d.offen.length > 0 && (
            <div className="mt-3">
              <p className="text-[12.5px] font-semibold uppercase tracking-wide text-gray-500">Noch ohne Termin</p>
              <ul className="mt-1 space-y-1 text-[14px]">
                {d.offen.map((o) => (
                  <li key={o.lead_id} className="flex flex-wrap justify-between gap-2">
                    <a href={`https://app.close.com/lead/${o.lead_id}/`} target="_blank" rel="noreferrer" className="truncate hover:text-red-700">
                      {o.name ?? 'Lead'}
                      {o.quelle ? <span className="text-gray-500"> · {o.quelle}</span> : null}
                    </a>
                    <span className="text-gray-500">{new Date(o.eingetragen_am).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {q && (q.ohneQuelle.length > 0 || q.automatisch > 0) && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px]">
              <span className="font-medium">Leadquelle fehlt:</span> {q.ohneQuelle.length + q.automatisch} von {q.gesamt} Leads
              {q.automatisch > 0 && <span className="text-gray-500"> · {q.automatisch} davon automatisch aus UTM-Daten setzbar</span>}
            </p>
            {q.automatisch > 0 && (
              <Button variant="secondary" onClick={nachtragen} disabled={laeuft}>
                {laeuft ? 'Trage nach …' : 'Aus UTM nachtragen'}
              </Button>
            )}
          </div>
          {meldung && <p className="mt-1 text-[13px] text-gray-600">{meldung}</p>}
          {q.ohneQuelle.length > 0 && (
            <>
              <p className="mt-2 text-[13px] text-gray-600">Von Hand angelegt – bitte in Close eintragen (z. B. „Empfehlung – Name“, „LinkedIn“, „Kaltakquise“):</p>
              <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-[14px]">
                {q.ohneQuelle.map((o) => (
                  <li key={o.id} className="flex justify-between gap-2">
                    <a href={`https://app.close.com/lead/${o.id}/`} target="_blank" rel="noreferrer" className="truncate hover:text-red-700">
                      {o.name}
                    </a>
                    <span className="text-gray-500">{new Date(o.erstellt).toLocaleDateString('de-DE')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
