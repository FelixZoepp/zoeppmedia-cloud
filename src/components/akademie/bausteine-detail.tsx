'use client';

import { useState } from 'react';
import { ChecklisteBaustein, ReviewBaustein } from './bausteine';

/**
 * Bausteine 3 und 4 auf der SOP-Seite. Ohne Vorgang gilt die Checkliste allgemein;
 * mit Vorgang (z. B. Kundenname) startet sie für jeden Vorgang neu.
 */
export function BausteineDetail({ slug, checkliste, review }: { slug: string; checkliste: string[]; review: string[] }) {
  const [vorgang, setVorgang] = useState('');
  const [aktiv, setAktiv] = useState('');
  const kontext = aktiv ? `vorgang:${aktiv}` : '';

  return (
    <div className="mt-8 space-y-6 border-t border-[var(--hair)] pt-5">
      <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
        <span className="text-gray-600">Vorgang (optional):</span>
        <input
          value={vorgang}
          onChange={(e) => setVorgang(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setAktiv(vorgang.trim())}
          placeholder="z. B. Kundenname"
          className="h-8 rounded-full border border-[var(--hair)] bg-transparent px-3"
        />
        <button onClick={() => setAktiv(vorgang.trim())} className="h-8 rounded-full bg-panel px-3 text-gray-700">Übernehmen</button>
        {aktiv && <span className="text-gray-500">Checkliste gilt für: {aktiv}</span>}
      </div>
      <section>
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-gray-500">3 · Checkliste zum Abarbeiten</h3>
        <div className="mt-1.5"><ChecklisteBaustein key={`c|${kontext}`} slug={slug} punkte={checkliste} kontext={kontext} /></div>
      </section>
      <section>
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-gray-500">4 · Review-Checkliste (danach)</h3>
        <div className="mt-1.5"><ReviewBaustein key={`r|${kontext}`} slug={slug} punkte={review} kontext={kontext} /></div>
      </section>
    </div>
  );
}
