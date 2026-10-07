'use client';

import { useRef } from 'react';

/** Ablauf-Video auf der Terminseite – meldet den ersten Start einmal (für die Notiz in Close) */
export function AblaufVideo({ terminId, src, titel }: { terminId: string; src: string; titel: string }) {
  const gemeldet = useRef(false);
  return (
    <video
      className="mt-3 aspect-video w-full rounded-xl bg-black"
      src={src}
      title={titel}
      controls
      playsInline
      preload="metadata"
      onPlay={() => {
        if (gemeldet.current) return;
        gemeldet.current = true;
        fetch(`/api/termin/${terminId}/aktion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aktion: 'video' }),
          keepalive: true,
        }).catch(() => {});
      }}
    />
  );
}
