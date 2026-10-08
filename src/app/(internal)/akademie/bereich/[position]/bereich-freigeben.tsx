'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Admin: alle Entwürfe dieser Bereichs-Akademie auf einmal freigeben */
export function BereichFreigeben({ position, entwuerfe }: { position: string; entwuerfe: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  async function freigeben(mitPlatzhaltern: boolean) {
    if (mitPlatzhaltern && !window.confirm('Auch Artikel mit offenen „Felix ergänzt“-Platzhaltern freigeben? Mitarbeiter sehen die Platzhalter dann.')) return;
    setBusy(true);
    const r = await fetch(`/api/akademie/bereiche/${position}/freigeben`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mitPlatzhaltern }) });
    const d = r.ok ? ((await r.json()) as { freigegeben: number; mitPlatzhalternOffen: number }) : null;
    setMeldung(d ? `${d.freigegeben} freigegeben${d.mitPlatzhalternOffen ? ` · ${d.mitPlatzhalternOffen} mit Platzhaltern bleiben Entwurf` : ''}` : 'Fehler beim Freigeben');
    setBusy(false);
    router.refresh();
  }

  if (!entwuerfe) return <p className="mt-3 text-[13px] text-gray-500">Alle Themen dieses Bereichs sind freigegeben.</p>;
  return (
    <div className="mt-4 rounded-[12px] bg-amber-50 px-3 py-2.5 text-[13.5px] text-amber-900">
      <p>{entwuerfe} Entwürfe in diesem Bereich – für Mitarbeiter noch unsichtbar.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void freigeben(false)} className="rounded-full bg-red-950 px-3 py-1.5 font-medium text-red-50">Ganzen Bereich freigeben (ohne Platzhalter)</button>
        <button disabled={busy} onClick={() => void freigeben(true)} className="rounded-full bg-white px-3 py-1.5 font-medium text-gray-700">Alles freigeben</button>
      </div>
      {meldung && <p className="mt-1.5">{meldung}</p>}
    </div>
  );
}
