'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/** Handelsregisterauszug hochladen – privat gespeichert, nur für Zoepp Media sichtbar */
export function HandelsregisterUpload() {
  const [datei, setDatei] = useState<{ dateiname: string; url: string | null } | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/onboarding/handelsregister', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.dateiname && setDatei({ dateiname: d.dateiname, url: d.url }))
      .catch(() => {});
  }, []);

  async function hochladen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLaedt(true);
    setFehler(null);
    try {
      const r = await fetch('/api/onboarding/handelsregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime: f.type, groesse: f.size }),
      });
      const link = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(link.error ?? 'Upload fehlgeschlagen');
      const { error } = await createClient().storage.from(link.bucket).uploadToSignedUrl(link.pfad, link.token, f, { contentType: f.type });
      if (error) throw new Error('Upload fehlgeschlagen – bitte erneut versuchen');
      const s = await fetch('/api/onboarding/handelsregister', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pfad: link.pfad, dateiname: f.name }),
      });
      const d = await s.json().catch(() => ({}));
      if (!s.ok) throw new Error(d.error ?? 'Speichern fehlgeschlagen');
      setDatei({ dateiname: d.dateiname, url: null });
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setLaedt(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function entfernen() {
    setLaedt(true);
    await fetch('/api/onboarding/handelsregister', { method: 'DELETE' }).catch(() => {});
    setDatei(null);
    setLaedt(false);
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">Handelsregisterauszug *</label>
      {datei ? (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5">
          <FileText className="h-4 w-4 shrink-0 text-green-700" />
          {datei.url ? (
            <a href={datei.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-sm text-green-800 underline">{datei.dateiname}</a>
          ) : (
            <span className="flex-1 truncate text-sm text-green-800">{datei.dateiname}</span>
          )}
          <button type="button" onClick={entfernen} disabled={laedt} className="text-gray-400 hover:text-red-600" aria-label="Entfernen">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={laedt}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500 hover:border-red-200 hover:text-red-700"
        >
          <Upload className="h-4 w-4" />
          {laedt ? 'Wird hochgeladen…' : 'PDF, JPG oder PNG auswählen (max. 10 MB)'}
        </button>
      )}
      <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={hochladen} />
      {fehler && <p className="mt-1.5 text-xs text-red-600">{fehler}</p>}
      <p className="mt-1 text-xs text-gray-400">
        Aktueller Auszug (nicht älter als 6 Monate). Den brauchen wir, um für euch eine eigene Festnetznummer für WhatsApp anzumelden. Er wird vertraulich gespeichert.
      </p>
    </div>
  );
}
