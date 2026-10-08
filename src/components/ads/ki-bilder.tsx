'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';

interface Variante {
  pfad: string;
  format: string;
  vorschau_url: string | null;
}

/** KI-Bildvarianten einer Grafik-Ad: ansehen, auswählen, neu erzeugen (Ads-Board). */
export function KiBilder({ adId, onGeaendert }: { adId: string; onGeaendert: () => Promise<void> }) {
  const [varianten, setVarianten] = useState<Variante[]>([]);
  const [ausgewaehlt, setAusgewaehlt] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const uebernehmen = (d: { varianten?: Variante[]; ausgewaehlt?: string | null; status?: string | null }) => {
    setVarianten(d.varianten ?? []);
    setAusgewaehlt(d.ausgewaehlt ?? null);
    setStatus(d.status ?? null);
  };

  useEffect(() => {
    let abgebrochen = false;
    fetch(`/api/ads/${adId}/bilder`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => !abgebrochen && uebernehmen(d));
    return () => {
      abgebrochen = true;
    };
  }, [adId]);

  const anfrage = async (method: 'POST' | 'PATCH', body: Record<string, unknown>, erfolg?: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/ads/${adId}/bilder`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'Fehlgeschlagen');
      uebernehmen(d);
      if (erfolg) toast.success(erfolg);
      await onGeaendert();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-500 uppercase">KI-Bilder</p>
        <button
          disabled={busy}
          onClick={() => anfrage('POST', { neu: varianten.length > 0 }, 'Neue Bilder erzeugt')}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {busy ? 'Erzeuge … (bis 1 Min.)' : varianten.length ? 'Neue Bilder erzeugen' : 'KI-Bilder erzeugen'}
        </button>
      </div>
      {status?.startsWith('fehler') && <p className="text-xs text-red-700 mb-1.5">{status.replace(/^fehler:\s*/, '')}</p>}
      {varianten.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {varianten.map((v) =>
            v.vorschau_url ? (
              <button
                key={v.pfad}
                disabled={busy || v.pfad === ausgewaehlt}
                onClick={() => anfrage('PATCH', { pfad: v.pfad }, 'Bild ausgewählt')}
                title={v.format}
                className={`w-24 h-24 rounded-lg overflow-hidden border-2 ${v.pfad === ausgewaehlt ? 'border-green-600' : 'border-transparent hover:border-gray-300'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signierte Storage-URL */}
                <img src={v.vorschau_url} alt={v.format} className="w-full h-full object-cover" />
              </button>
            ) : null,
          )}
        </div>
      ) : (
        <p className="text-[11px] text-gray-400">Noch keine KI-Bilder – entstehen automatisch nach der Generierung oder per Knopf.</p>
      )}
    </div>
  );
}
