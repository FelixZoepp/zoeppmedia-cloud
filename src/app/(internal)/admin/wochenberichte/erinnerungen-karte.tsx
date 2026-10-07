'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';

interface Daten {
  aktiv: boolean;
  darfSchalten: boolean;
  faellig: Array<{ agency_id: string; name: string; aufgaben: string[]; an: string[] }>;
}

/** Automatische Erinnerungen an Kunden mit offenen Aufgaben – Schalter + wer heute dran wäre */
export function ErinnerungenKarte() {
  const [d, setD] = useState<Daten | null>(null);
  const [busy, setBusy] = useState(false);

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

  if (!d) return null;
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px] font-medium">Erinnerungen an offene Kunden-Aufgaben</p>
          <p className="text-[13.5px] text-gray-600">
            Ist eine Frist abgelaufen (Zugänge, Formular, Bilder …), bekommt der Kunde morgens eine freundliche E-Mail und eine Benachrichtigung – höchstens alle 2 Tage, max. 3-mal. Danach steht er im Cockpit zum Anrufen.{' '}
            {d.aktiv ? 'Ist an.' : 'Ist aus.'}
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
              <li key={k.agency_id} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
                <span className="min-w-0">
                  <span className="font-medium">{k.name}</span>
                  <span className="text-gray-500"> · {k.aufgaben.length} offen: {k.aufgaben.slice(0, 3).join(', ')}{k.aufgaben.length > 3 ? ' …' : ''}</span>
                </span>
                <a
                  href={`/api/admin/kunden-erinnerungen?vorschau=${k.agency_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-red-700 hover:underline"
                >
                  <Eye className="h-3.5 w-3.5" /> Mail ansehen
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
