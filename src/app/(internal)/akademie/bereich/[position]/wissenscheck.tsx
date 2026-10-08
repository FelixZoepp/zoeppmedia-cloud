'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

interface Frage {
  id: string;
  frage: string;
  optionen: string[];
}

export function Wissenscheck({ bereich }: { bereich: string }) {
  const [fragen, setFragen] = useState<Frage[]>([]);
  const [antworten, setAntworten] = useState<Record<string, number>>({});
  const [ergebnis, setErgebnis] = useState<{ richtig: number; gesamt: number; bestanden: boolean; falsch: string[] } | null>(null);
  const [letztes, setLetztes] = useState<{ richtig: number; gesamt: number; bestanden: boolean; created_at: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/akademie/wissenscheck/${bereich}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setFragen(d?.fragen ?? []);
        setLetztes(d?.letztes ?? null);
      });
  }, [bereich]);

  async function abgeben() {
    setBusy(true);
    const r = await fetch(`/api/akademie/wissenscheck/${bereich}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ antworten }) });
    if (r.ok) setErgebnis(await r.json());
    setBusy(false);
  }

  if (!fragen.length) return <p className="text-[14px] text-gray-500">Lädt …</p>;
  const falsch = new Set(ergebnis?.falsch ?? []);

  return (
    <div className="space-y-4">
      {letztes && !ergebnis && (
        <p className={`text-[13.5px] ${letztes.bestanden ? 'text-green-700' : 'text-amber-700'}`}>
          Zuletzt am {new Date(letztes.created_at).toLocaleDateString('de-DE')}: {letztes.richtig}/{letztes.gesamt} – {letztes.bestanden ? 'bestanden' : 'nicht bestanden'}
        </p>
      )}
      {fragen.map((f, i) => (
        <fieldset key={f.id}>
          <legend className="flex items-center gap-1.5 text-[15px] font-medium">
            {ergebnis && (falsch.has(f.id) ? <XCircle className="h-4 w-4 text-red-600" /> : <CheckCircle2 className="h-4 w-4 text-green-600" />)}
            {i + 1}. {f.frage}
          </legend>
          <div className="mt-1.5 space-y-1">
            {f.optionen.map((o, j) => (
              <label key={j} className="flex cursor-pointer items-center gap-2 text-[14.5px]">
                <input type="radio" name={f.id} checked={antworten[f.id] === j} onChange={() => { setAntworten((a) => ({ ...a, [f.id]: j })); setErgebnis(null); }} />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {ergebnis && (
        <p className={`rounded-[12px] px-3 py-2 text-[14.5px] ${ergebnis.bestanden ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>
          {ergebnis.richtig} von {ergebnis.gesamt} richtig – {ergebnis.bestanden ? 'bestanden.' : 'noch nicht bestanden. Lies die markierten Themen nach und versuch es noch einmal.'}
        </p>
      )}
      <button onClick={() => void abgeben()} disabled={busy || Object.keys(antworten).length < fragen.length} className="rounded-full bg-red-950 px-4 py-2 text-[14px] font-medium text-red-50 disabled:opacity-40">
        Auswerten
      </button>
    </div>
  );
}
