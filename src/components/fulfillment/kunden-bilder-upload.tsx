'use client';

/** Bilder fürs Fulfillment hochladen – Fotos vom Kunden selbst zuerst, dann Team, Arbeitsalltag, Logo */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { KATEGORIEN, type BildKategorie } from '@/lib/kunden-bilder-kategorien';

type Bild = { id: string; kategorie: BildKategorie; dateiname: string | null; url: string | null };

export function KundenBilderUpload({ onAnzahl }: { onAnzahl?: (n: Record<BildKategorie, number>) => void }) {
  const [bilder, setBilder] = useState<Bild[]>([]);
  const [laedt, setLaedt] = useState<BildKategorie | null>(null);
  const inputs = useRef<Partial<Record<BildKategorie, HTMLInputElement | null>>>({});

  const laden = useCallback(async () => {
    const r = await fetch('/api/kunden-bilder', { cache: 'no-store' });
    if (!r.ok) return;
    const d = (await r.json()) as { bilder: Bild[] };
    setBilder(d.bilder);
    const n = { ich: 0, team: 0, arbeit: 0, logo: 0 } as Record<BildKategorie, number>;
    for (const b of d.bilder) n[b.kategorie] = (n[b.kategorie] ?? 0) + 1;
    onAnzahl?.(n);
  }, [onAnzahl]);

  useEffect(() => {
    const t = setTimeout(() => void laden(), 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function hochladen(kategorie: BildKategorie, dateien: FileList | null) {
    const liste = Array.from(dateien ?? []);
    if (!liste.length) return;
    setLaedt(kategorie);
    const fertig: Array<{ pfad: string; dateiname: string; kategorie: BildKategorie }> = [];
    let fehler = 0;
    for (const f of liste) {
      try {
        const r = await fetch('/api/kunden-bilder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mime: f.type, groesse: f.size }) });
        const link = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(link.error ?? 'Upload fehlgeschlagen');
        const { error } = await createClient().storage.from(link.bucket).uploadToSignedUrl(link.pfad, link.token, f, { contentType: f.type });
        if (error) throw new Error('Upload fehlgeschlagen');
        fertig.push({ pfad: link.pfad, dateiname: f.name, kategorie });
      } catch (e) {
        fehler++;
        toast.error(`${f.name}: ${e instanceof Error ? e.message : 'Upload fehlgeschlagen'}`);
      }
    }
    if (fertig.length) {
      const s = await fetch('/api/kunden-bilder', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bilder: fertig }) });
      if (s.ok) toast.success(fertig.length === 1 ? 'Bild hochgeladen' : `${fertig.length} Bilder hochgeladen`);
      else toast.error('Speichern fehlgeschlagen – bitte erneut versuchen');
    }
    if (!fertig.length && !fehler) toast.error('Upload fehlgeschlagen');
    setLaedt(null);
    const input = inputs.current[kategorie];
    if (input) input.value = '';
    await laden();
  }

  async function entfernen(id: string) {
    const r = await fetch(`/api/kunden-bilder?id=${id}`, { method: 'DELETE' });
    if (!r.ok) return toast.error('Entfernen fehlgeschlagen');
    await laden();
  }

  return (
    <div className="mt-3 space-y-4">
      {(Object.keys(KATEGORIEN) as BildKategorie[]).map((k) => {
        const eigene = bilder.filter((b) => b.kategorie === k);
        return (
          <div key={k} className={k === 'ich' ? 'rounded-xl border border-red-200 bg-red-50/40 p-3' : ''}>
            <p className="text-sm font-semibold text-gray-900">
              {KATEGORIEN[k].titel}
              {k === 'ich' && <span className="ml-2 rounded-full bg-red-700 px-2 py-0.5 text-[11px] font-semibold text-white">wichtig</span>}
            </p>
            <p className="mt-0.5 text-xs text-gray-600">{KATEGORIEN[k].hinweis}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {eigene.map((b) => (
                <div key={b.id} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                  {b.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.url} alt={b.dateiname ?? ''} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center px-1 text-center text-[10px] text-gray-500">{b.dateiname ?? 'Bild'}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => entfernen(b.id)}
                    className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-gray-600 hover:text-red-700"
                    aria-label="Bild entfernen"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={laedt !== null}
                onClick={() => inputs.current[k]?.click()}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-[11px] text-gray-500 hover:border-red-300 hover:text-red-700 disabled:opacity-60"
              >
                {laedt === k ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                {laedt === k ? 'Lädt…' : 'Hinzufügen'}
              </button>
            </div>
            <input
              ref={(el) => {
                inputs.current[k] = el;
              }}
              type="file"
              multiple={k !== 'logo'}
              accept={k === 'logo' ? 'image/png,image/jpeg,image/svg+xml,image/webp' : 'image/jpeg,image/png,image/webp,image/heic,image/heif'}
              className="hidden"
              onChange={(e) => hochladen(k, e.target.files)}
            />
          </div>
        );
      })}
    </div>
  );
}
