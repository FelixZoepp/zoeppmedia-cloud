'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';

interface Daten {
  aktiv: boolean;
  darfSchalten: boolean;
  vorlage: string;
  ohneNummer: Array<{ id: string; name: string; kontakt: string | null }>;
  faellig: Array<{ agency_id: string; name: string; aufgaben: string[]; nummer: string | null; text: string; ergebnis: string }>;
}

/** Automatische Erinnerungen an Kunden mit offenen Aufgaben – Schalter + wer heute dran wäre */
export function ErinnerungenKarte() {
  const [d, setD] = useState<Daten | null>(null);
  const [busy, setBusy] = useState(false);
  const [nummern, setNummern] = useState<Record<string, string>>({});

  const laden = useCallback(async () => {
    const r = await fetch('/api/admin/kunden-erinnerungen', { cache: 'no-store' });
    if (r.ok) setD(await r.json());
  }, []);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function schalten() {
    if (!d) return;
    setBusy(true);
    const r = await fetch('/api/admin/kunden-erinnerungen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktiv: !d.aktiv }) });
    setBusy(false);
    if (!r.ok) return void toast.error('Konnte nicht gespeichert werden');
    toast.success(!d.aktiv ? 'Erinnerungen an – täglich morgens' : 'Erinnerungen aus');
    void laden();
  }

  async function nummerSpeichern(id: string) {
    const r = await fetch('/api/admin/kunden-erinnerungen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktion: 'nummer', agency_id: id, nummer: nummern[id] ?? '' }),
    });
    const x = await r.json().catch(() => ({}));
    if (!r.ok) return void toast.error(x.error ?? 'Fehler');
    toast.success('Nummer gespeichert – Kunde steht jetzt im Sales-WhatsApp unter „Kunden“');
    void laden();
  }

  if (!d) return null;
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px] font-medium">Erinnerungen an offene Kunden-Aufgaben</p>
          <p className="text-[13.5px] text-gray-600">
            Ist eine Frist abgelaufen (Zugänge, Formular, Bilder …), schreibt der WhatsApp-Bot dem Kunden morgens über die Sales-Nummer (Vorlage mit Button zu „Deine Aufgaben“) – höchstens alle 2 Tage, max. 3-mal. Danach steht er im Cockpit zum Anrufen.{' '}
            {d.aktiv ? 'Ist an.' : 'Ist aus.'} WhatsApp-Vorlage bei Meta:{' '}
            <strong className="font-semibold">{d.vorlage === 'approved' ? 'freigegeben' : d.vorlage === 'pending' ? 'wird geprüft' : d.vorlage === 'rejected' ? 'abgelehnt' : 'noch nicht eingereicht'}</strong>
          </p>
        </div>
        {d.darfSchalten && (
          <Button variant={d.aktiv ? 'secondary' : 'primary'} disabled={busy} onClick={schalten}>
            {d.aktiv ? 'Erinnerungen ausschalten' : 'Erinnerungen einschalten'}
          </Button>
        )}
      </div>
      <div className="mt-3 border-t border-gray-100 pt-3">
        <p className="text-[12.5px] font-semibold uppercase tracking-wide text-gray-500">{d.aktiv ? 'Wird beim nächsten Lauf erinnert' : 'Würde heute erinnert'}</p>
        {d.faellig.length === 0 ? (
          <p className="mt-1 text-[14px] text-gray-500">Gerade niemand.</p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {d.faellig.map((k) => (
              <li key={k.agency_id} className="text-[14px]">
                <span className="font-medium">{k.name}</span>
                <span className={k.nummer ? 'text-gray-500' : 'font-medium text-amber-700'}> · {k.nummer ?? 'keine Handynummer – bitte beim Kunden eintragen'}</span>
                <p className="mt-0.5 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[13px] text-gray-700">{k.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      {d.ohneNummer.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-[12.5px] font-semibold uppercase tracking-wide text-gray-500">Handynummer fehlt ({d.ohneNummer.length})</p>
          <p className="text-[13px] text-gray-600">Ohne Nummer kann der Bot nicht erinnern. Auch in Close ist keine hinterlegt.</p>
          <ul className="mt-2 space-y-1.5">
            {d.ohneNummer.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-2 text-[14px]">
                <span className="min-w-[180px] flex-1 truncate">
                  {k.name}
                  {k.kontakt && <span className="text-gray-500"> · {k.kontakt}</span>}
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="0170 1234567"
                  value={nummern[k.id] ?? ''}
                  onChange={(e) => setNummern((n) => ({ ...n, [k.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && nummerSpeichern(k.id)}
                  className="h-9 w-44 rounded-lg border border-gray-300 px-2.5 text-[14px]"
                />
                <Button size="sm" variant="secondary" disabled={!nummern[k.id]?.trim()} onClick={() => nummerSpeichern(k.id)}>
                  Speichern
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
