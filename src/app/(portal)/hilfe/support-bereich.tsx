'use client';

import { useCallback, useEffect, useState } from 'react';
import { Inbox, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card } from '@/components/ui';

interface Anfrage {
  id: string;
  art: 'frage' | 'problem' | 'wunsch' | 'interesse';
  thema: string;
  nachricht: string | null;
  status: 'offen' | 'in_bearbeitung' | 'erledigt';
  antwort: string | null;
  created_at: string;
}

const ARTEN = [
  { value: 'frage', label: 'Frage' },
  { value: 'problem', label: 'Problem' },
  { value: 'wunsch', label: 'Wunsch' },
] as const;

const ART_LABEL: Record<Anfrage['art'], string> = { frage: 'Frage', problem: 'Problem', wunsch: 'Wunsch', interesse: 'Interesse' };
const STATUS: Record<Anfrage['status'], { label: string; tone: 'warning' | 'softAccent' | 'success' }> = {
  offen: { label: 'Offen', tone: 'warning' },
  in_bearbeitung: { label: 'In Bearbeitung', tone: 'softAccent' },
  erledigt: { label: 'Erledigt', tone: 'success' },
};

const feld =
  'w-full rounded-[12px] bg-card px-3.5 text-[15px] text-ink shadow-[inset_0_0_0_1.5px_var(--hair)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--r-700)]';

/** Support-Anfrage stellen und eigene Anfragen mit Antworten sehen (nur Kunden) */
export function SupportBereich() {
  const [anfragen, setAnfragen] = useState<Anfrage[] | null>(null);
  const [art, setArt] = useState<Anfrage['art']>('frage');
  const [thema, setThema] = useState('');
  const [nachricht, setNachricht] = useState('');
  const [sendet, setSendet] = useState(false);

  const laden = useCallback(async () => {
    const r = await fetch('/api/support', { cache: 'no-store' });
    setAnfragen(r.ok ? await r.json() : []);
  }, []);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function senden(e: React.FormEvent) {
    e.preventDefault();
    setSendet(true);
    const res = await fetch('/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ art, thema, nachricht }),
    });
    const d = await res.json().catch(() => ({}));
    setSendet(false);
    if (!res.ok) return toast.error(d.error ?? 'Anfrage konnte nicht gesendet werden');
    toast.success('Anfrage gesendet – wir melden uns schnellstmöglich.');
    setThema('');
    setNachricht('');
    await laden();
  }

  return (
    <div id="support" className="mt-4 grid scroll-mt-24 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <h2 className="text-[22px] font-medium tracking-[-0.025em]">Support-Anfrage</h2>
        <p className="mt-1 text-[14px] text-gray-600">Keine Antwort gefunden? Schreib uns – dein Ansprechpartner bekommt die Anfrage sofort.</p>
        <form onSubmit={senden} className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Art der Anfrage">
            {ARTEN.map((a) => (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={art === a.value}
                onClick={() => setArt(a.value)}
                className={`rounded-full px-4 py-2 text-[14px] font-medium transition-colors ${
                  art === a.value ? 'bg-gradient-to-b from-red-700 to-red-950 text-red-50' : 'bg-panel text-gray-700 hover:bg-gray-100'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-gray-600">Thema</span>
            <input value={thema} onChange={(e) => setThema(e.target.value)} maxLength={200} required placeholder="z. B. WhatsApp verbinden" className={`${feld} h-11`} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-gray-600">Nachricht</span>
            <textarea
              value={nachricht}
              onChange={(e) => setNachricht(e.target.value)}
              rows={4}
              maxLength={4000}
              required
              placeholder="Beschreib kurz, worum es geht."
              className={`${feld} py-2.5`}
            />
          </label>
          <Button type="submit" disabled={sendet || thema.trim().length < 3 || !nachricht.trim()} className="w-full sm:w-auto">
            {sendet ? <Loader2 className="animate-spin" /> : <Send />} Anfrage senden
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-[22px] font-medium tracking-[-0.025em]">Deine Anfragen</h2>
        {!anfragen ? (
          <div className="flex justify-center py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
          </div>
        ) : anfragen.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center text-gray-500">
            <Inbox className="h-8 w-8" />
            <p className="mt-2 text-[14px]">Noch keine Anfragen.</p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-hair">
            {anfragen.map((a) => (
              <li key={a.id} className="py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                  <span className="text-[12px] text-gray-500">
                    {ART_LABEL[a.art]} · {new Date(a.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                </div>
                <p className="mt-1.5 text-[15px] font-medium">{a.thema}</p>
                {a.nachricht && <p className="mt-0.5 line-clamp-3 text-[13.5px] text-gray-600">{a.nachricht}</p>}
                {a.antwort && (
                  <div className="mt-2 rounded-[12px] bg-red-50 px-3 py-2 text-[13.5px] text-red-950">
                    <span className="font-semibold">Antwort: </span>
                    {a.antwort}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
