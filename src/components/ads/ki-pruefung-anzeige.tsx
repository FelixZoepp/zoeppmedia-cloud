'use client';

import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import type { KiPruefung } from '@/lib/ads/ki-pruefung';

const AMPEL = {
  gruen: { label: 'Kann raus', cls: 'bg-green-100 text-green-800' },
  gelb: { label: 'Geht, mit Verbesserungen', cls: 'bg-amber-100 text-amber-800' },
  rot: { label: 'So nicht zum Kunden', cls: 'bg-red-100 text-red-800' },
} as const;

/** Ergebnis der KI-Prüfung (doppelter Boden vor der Kundenfreigabe) */
export function KiPruefungAnzeige({ p, veraltet = false }: { p: KiPruefung; veraltet?: boolean }) {
  const a = AMPEL[p.ampel];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-[13.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-gray-500" />
        <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${a.cls}`}>{a.label}</span>
        <span className="font-semibold">{p.punkte}/100</span>
        <span className="text-gray-500">
          · {p.quelle === 'video' ? `${p.bilder} Standbild(er) + Text` : p.quelle === 'bild' ? 'Grafik + Text' : 'Text'} · {new Date(p.am).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
        {veraltet && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[12px] text-gray-600">veraltet – Ad wurde geändert</span>}
      </div>
      <p className="mt-2 text-gray-800">{p.zusammenfassung}</p>
      {p.verbesserungen.length > 0 && (
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-gray-800">
          {p.verbesserungen.map((v, i) => <li key={i}>{v}</li>)}
        </ol>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-[12.5px] text-gray-500">Alle Kriterien ({p.kriterien.filter((k) => k.ok).length}/{p.kriterien.length} erfüllt)</summary>
        <ul className="mt-1.5 space-y-1">
          {p.kriterien.map((k, i) => (
            <li key={i} className="flex gap-2">
              {k.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-700" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-700" />}
              <span><strong className="font-medium">{k.name}:</strong> {k.hinweis}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** Standbilder aus einem Video im Browser ziehen (nur bei Dateien, die CORS erlauben – sonst leer) */
export async function videoStandbilder(src: string, anzahl = 5): Promise<string[]> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.preload = 'auto';
    v.src = src;
    const bilder: string[] = [];
    const fertig = () => resolve(bilder);
    const timeout = setTimeout(fertig, 20000);
    v.onerror = () => {
      clearTimeout(timeout);
      fertig();
    };
    v.onloadedmetadata = async () => {
      const d = v.duration;
      if (!d || !isFinite(d)) return fertig();
      const zeiten = Array.from({ length: anzahl }, (_, i) => (i === 0 ? Math.min(0.5, d / 10) : (d * i) / (anzahl - 1) - (i === anzahl - 1 ? 0.3 : 0)));
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 960 / Math.max(v.videoWidth, v.videoHeight));
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      try {
        for (const t of zeiten) {
          await new Promise<void>((r) => {
            v.onseeked = () => r();
            v.currentTime = Math.max(0, t);
          });
          ctx?.drawImage(v, 0, 0, canvas.width, canvas.height);
          bilder.push(canvas.toDataURL('image/jpeg', 0.72));
        }
      } catch {
        // Canvas „tainted“ (fremde Quelle ohne CORS) → ohne Standbilder weiter
        bilder.length = 0;
      }
      clearTimeout(timeout);
      fertig();
    };
  });
}
