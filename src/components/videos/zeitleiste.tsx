'use client';

import { zeitText } from '@/lib/videos/konstanten';

export interface ZeitMarker {
  id: string;
  zeit_s: number;
  zeit_bis_s?: number | null;
  /** Tailwind-Hintergrundklasse */
  farbe: string;
  titel: string;
}

/** Zeitleiste mit Punkt-Markern, Bereichs-Balken und optional dem gerade markierten Bereich */
export function Zeitleiste({
  laenge,
  zeit,
  marker,
  bereich,
  onSpringe,
}: {
  laenge: number;
  zeit: number;
  marker: ZeitMarker[];
  bereich?: { von: number; bis: number | null } | null;
  onSpringe: (s: number) => void;
}) {
  const pz = (s: number) => `${Math.min(100, Math.max(0, (s / laenge) * 100))}%`;
  return (
    <div
      className="relative mt-3 h-7 cursor-pointer rounded-full bg-gray-100"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSpringe(((e.clientX - r.left) / r.width) * laenge);
      }}
    >
      <div className="absolute inset-y-0 left-0 rounded-full bg-red-100" style={{ width: pz(zeit) }} />
      {bereich && (
        <div
          className="absolute inset-y-1 rounded-full border-2 border-dashed border-red-500 bg-red-500/10"
          style={{ left: pz(bereich.von), width: bereich.bis !== null ? `calc(${pz(bereich.bis)} - ${pz(bereich.von)})` : '3px' }}
        />
      )}
      {marker
        .filter((m) => m.zeit_bis_s && m.zeit_bis_s > m.zeit_s)
        .map((m) => (
          <button
            key={`b-${m.id}`}
            type="button"
            title={`${zeitText(m.zeit_s)}–${zeitText(m.zeit_bis_s)} · ${m.titel}`}
            onClick={(e) => {
              e.stopPropagation();
              onSpringe(m.zeit_s);
            }}
            className={`absolute bottom-0.5 h-1.5 rounded-full opacity-70 ${m.farbe}`}
            style={{ left: pz(m.zeit_s), width: `calc(${pz(m.zeit_bis_s!)} - ${pz(m.zeit_s)})` }}
            aria-label={`Bereich ${zeitText(m.zeit_s)} bis ${zeitText(m.zeit_bis_s)}`}
          />
        ))}
      {marker.map((m) => (
        <button
          key={m.id}
          type="button"
          title={`${zeitText(m.zeit_s)} – ${m.titel}`}
          onClick={(e) => {
            e.stopPropagation();
            onSpringe(m.zeit_s);
          }}
          className={`absolute top-[45%] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${m.farbe}`}
          style={{ left: pz(m.zeit_s) }}
          aria-label={`Kommentar bei ${zeitText(m.zeit_s)}`}
        />
      ))}
    </div>
  );
}

/** „0:12“ bzw. „0:12–0:18“ */
export function zeitLabel(von: number | null, bis?: number | null): string {
  if (von === null) return 'allg.';
  return bis && bis > von ? `${zeitText(von)}–${zeitText(bis)}` : zeitText(von);
}
