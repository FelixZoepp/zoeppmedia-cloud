'use client';

import { useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { zeitText } from '@/lib/videos/konstanten';
import { useTastenkuerzel } from './tastenkuerzel';

interface V {
  id: string;
  version: number;
  url: string | null;
}

/** Zwei Versionen nebeneinander, synchron (links steuert, rechts folgt) */
export function VersionVergleich({ versionen }: { versionen: V[] }) {
  const mitUrl = versionen.filter((v) => v.url);
  const [links, setLinks] = useState(mitUrl[1]?.id ?? mitUrl[0]?.id ?? '');
  const [rechts, setRechts] = useState(mitUrl[0]?.id ?? '');
  const [laeuft, setLaeuft] = useState(false);
  const [zeit, setZeit] = useState(0);
  const [dauer, setDauer] = useState(0);
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);

  const sync = () => {
    if (a.current && b.current && Math.abs(a.current.currentTime - b.current.currentTime) > 0.08) b.current.currentTime = a.current.currentTime;
  };
  useTastenkuerzel(a, {});

  const auswahl = (wert: string, setze: (s: string) => void) => (
    <select className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-[13px]" value={wert} onChange={(e) => setze(e.target.value)}>
      {mitUrl.map((v) => (
        <option key={v.id} value={v.id}>
          Version {v.version}
        </option>
      ))}
    </select>
  );
  const url = (id: string) => mitUrl.find((v) => v.id === id)?.url ?? undefined;

  return (
    <div>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          {auswahl(links, setLinks)}
          <video
            ref={a}
            key={`a-${links}`}
            src={url(links)}
            playsInline
            muted={false}
            className="mt-1.5 aspect-video w-full rounded-xl bg-black"
            onPlay={() => {
              setLaeuft(true);
              sync();
              if (b.current) {
                b.current.playbackRate = a.current?.playbackRate ?? 1;
                void b.current.play();
              }
            }}
            onPause={() => {
              setLaeuft(false);
              b.current?.pause();
              sync();
            }}
            onSeeked={sync}
            onRateChange={() => {
              if (a.current && b.current) b.current.playbackRate = a.current.playbackRate;
            }}
            onLoadedMetadata={(e) => setDauer(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
            onTimeUpdate={(e) => {
              setZeit(e.currentTarget.currentTime);
              sync();
            }}
          />
        </div>
        <div>
          {auswahl(rechts, setRechts)}
          {/* rechts stumm, damit der Ton nicht doppelt läuft */}
          <video ref={b} key={`b-${rechts}`} src={url(rechts)} playsInline muted className="mt-1.5 aspect-video w-full rounded-xl bg-black" />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => (a.current?.paused ? void a.current.play() : a.current?.pause())}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-red-700 text-white"
          aria-label={laeuft ? 'Pause' : 'Abspielen'}
        >
          {laeuft ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <input
          type="range"
          className="flex-1"
          min={0}
          max={dauer}
          step={0.04}
          value={zeit}
          onChange={(e) => {
            if (a.current) a.current.currentTime = Number(e.target.value);
          }}
          aria-label="Position"
        />
        <span className="w-12 text-right text-[12.5px] text-gray-500">{zeitText(zeit)}</span>
      </div>
      <p className="mt-1 text-[12px] text-gray-500">Beide Videos laufen synchron; Ton kommt vom linken Video. Tastenkürzel steuern beide.</p>
    </div>
  );
}
