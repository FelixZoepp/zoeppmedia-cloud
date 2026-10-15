'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button, Card } from '@/components/ui';

interface Schalter {
  aktiv: boolean;
  testnummern: string[];
  testmails: string[];
  kunden: string[];
}

/** Freigabe „Bewerber-Kontakt“: bis zur Freigabe schreibt die Cloud keinen Bewerber automatisch an (Testnummern ausgenommen) */
export function BewerberKontaktKarte() {
  const [s, setS] = useState<Schalter | null>(null);
  const [nummern, setNummern] = useState('');
  const [mails, setMails] = useState('');

  useEffect(() => {
    let aktiv = true;
    fetch('/api/admin/bewerber-kontakt', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Schalter | null) => {
        if (!aktiv || !j) return;
        setS(j);
        setNummern(j.testnummern.join('\n'));
        setMails(j.testmails.join('\n'));
      });
    return () => {
      aktiv = false;
    };
  }, []);

  const speichern = async (patch: Partial<Schalter>) => {
    const r = await fetch('/api/admin/bewerber-kontakt', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error ?? 'Fehler');
    setS(j);
    toast.success('Gespeichert');
  };

  if (!s) return null;
  const zeilen = (t: string) => t.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  return (
    <Card className={`mb-4 ${s.aktiv ? '' : 'border border-amber-200 bg-amber-50/40'}`}>
      <div className="flex flex-wrap items-start gap-3">
        {s.aktiv ? <ShieldCheck className="h-6 w-6 flex-none text-green-700" /> : <ShieldAlert className="h-6 w-6 flex-none text-amber-700" />}
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-medium">Bewerber-Kontakt {s.aktiv ? 'freigegeben' : 'gesperrt'}</p>
          <p className="text-[13.5px] text-gray-600">
            {s.aktiv
              ? 'Der KI-Agent und alle Automatiken schreiben Bewerber an (WhatsApp, Erinnerungen, E-Mails).'
              : `Kein Bewerber wird automatisch angeschrieben – außer den Testnummern unten${s.kunden.length ? ` und bei ${s.kunden.length} einzeln freigegebenen Kunden (Kundenakte)` : ''}. Manuelle Nachrichten aus der Inbox gehen weiterhin. Aufgaben für den Innendienst entstehen trotzdem.`}
          </p>
        </div>
        <Button
          variant={s.aktiv ? 'secondary' : 'primary'}
          onClick={() => {
            if (!s.aktiv && !confirm('Bewerber-Kontakt freigeben? Ab jetzt schreibt der KI-Agent neue Bewerber automatisch an. Ältere Bewerber werden nicht nachträglich angeschrieben.')) return;
            void speichern({ aktiv: !s.aktiv });
          }}
        >
          {s.aktiv ? 'Wieder sperren' : 'Freigeben'}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-[12.5px] font-medium text-gray-600">
          Testnummern (eine pro Zeile)
          <textarea className="mt-1 min-h-[70px] w-full rounded-lg border border-gray-300 bg-white p-2 text-sm" placeholder="+49 151 …" value={nummern} onChange={(e) => setNummern(e.target.value)} />
        </label>
        <label className="block text-[12.5px] font-medium text-gray-600">
          Test-E-Mails (eine pro Zeile)
          <textarea className="mt-1 min-h-[70px] w-full rounded-lg border border-gray-300 bg-white p-2 text-sm" placeholder="du@zoeppmedia.de" value={mails} onChange={(e) => setMails(e.target.value)} />
        </label>
      </div>
      <div className="mt-2 flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => speichern({ testnummern: zeilen(nummern), testmails: zeilen(mails) })}>
          Testkontakte speichern
        </Button>
      </div>
    </Card>
  );
}
