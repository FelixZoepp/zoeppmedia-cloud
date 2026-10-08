'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, PlayCircle, Pencil } from 'lucide-react';

export function ArtikelAktionen({ slug, gelesen, videoGesehen, hatVideo, admin }: { slug: string; gelesen: boolean; videoGesehen: boolean; hatVideo: boolean; admin: boolean }) {
  const [g, setG] = useState(gelesen);
  const [v, setV] = useState(videoGesehen);

  async function setze(art: 'gelesen' | 'video') {
    const res = await fetch(`/api/akademie/artikel/${slug}/fortschritt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ art }) });
    if (res.ok) (art === 'gelesen' ? setG : setV)(true);
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-[var(--hair)] pt-4">
      <button onClick={() => setze('gelesen')} disabled={g} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-medium ${g ? 'bg-green-50 text-green-700' : 'bg-red-950 text-red-50'}`}>
        <CheckCircle2 className="h-4 w-4" /> {g ? 'Gelesen' : 'Als gelesen markieren'}
      </button>
      {hatVideo && (
        <button onClick={() => setze('video')} disabled={v} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-medium ${v ? 'bg-green-50 text-green-700' : 'bg-panel text-gray-700'}`}>
          <PlayCircle className="h-4 w-4" /> {v ? 'Video gesehen' : 'Video gesehen'}
        </button>
      )}
      {admin && (
        <Link href={`/admin/akademie/artikel/${slug}`} className="ml-auto inline-flex items-center gap-1.5 text-[14px] font-medium text-red-800 hover:underline">
          <Pencil className="h-4 w-4" /> Bearbeiten
        </Link>
      )}
    </div>
  );
}
