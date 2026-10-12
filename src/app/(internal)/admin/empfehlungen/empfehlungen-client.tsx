'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, PageHeader } from '@/components/ui';
import type { EmpfehlungsArt, EmpfehlungsStatus, Kandidat } from '@/lib/empfehlungen/kandidaten';

const ARTEN: Array<{ art: EmpfehlungsArt; label: string }> = [
  { art: 'empfehlung', label: '🤝 Empfehlung' },
  { art: 'video', label: '🎥 Video' },
  { art: 'bewertung', label: '⭐ Bewertung' },
];
const STATUS: Array<{ s: EmpfehlungsStatus; label: string; cls: string }> = [
  { s: 'vorgeschlagen', label: 'offen', cls: 'bg-gray-100 text-gray-600' },
  { s: 'angefragt', label: 'angefragt', cls: 'bg-blue-50 text-blue-700' },
  { s: 'zugesagt', label: 'zugesagt', cls: 'bg-yellow-50 text-yellow-800' },
  { s: 'erhalten', label: '✅ erhalten', cls: 'bg-green-50 text-green-700' },
  { s: 'abgelehnt', label: 'abgelehnt', cls: 'bg-red-50 text-red-600' },
];

export function EmpfehlungenClient() {
  const [liste, setListe] = useState<Kandidat[] | null>(null);

  const laden = useCallback(async () => {
    const r = await fetch('/api/admin/empfehlungen', { cache: 'no-store' });
    if (r.ok) setListe(((await r.json()) as { kandidaten: Kandidat[] }).kandidaten);
    else toast.error('Konnte nicht geladen werden');
  }, []);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  const setze = async (k: Kandidat, art: EmpfehlungsArt, status: EmpfehlungsStatus) => {
    let empfohlen_name: string | undefined;
    if (art === 'empfehlung' && status === 'erhalten') empfohlen_name = window.prompt('Wen hat der Kunde empfohlen? (Name / Firma)') ?? undefined;
    const r = await fetch('/api/admin/empfehlungen', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agency_id: k.agency_id, art, status, empfohlen_name, notiz: k.stand[art]?.notiz ?? undefined }) });
    if (!r.ok) toast.error('Nicht gespeichert');
    await laden();
  };

  const erhalten = (liste ?? []).reduce((s, k) => s + ARTEN.filter((a) => k.stand[a.art]?.status === 'erhalten').length, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        label="KUNDEN"
        title="Empfehlungen"
        description="Zufriedene Kunden mit guten Ergebnissen: Empfehlung, Video und Bewertung anfragen – per Anruf, nie automatisch."
      />
      {!liste && (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-600" />
        </div>
      )}
      {liste && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card padding="none" className="p-4"><p className="text-xs text-gray-500">🌟 Kandidaten</p><p className="text-xl font-bold">{liste.filter((k) => k.kandidat).length}</p></Card>
            <Card padding="none" className="p-4"><p className="text-xs text-gray-500">📞 Angefragt</p><p className="text-xl font-bold">{liste.reduce((s, k) => s + ARTEN.filter((a) => k.stand[a.art]?.status === 'angefragt').length, 0)}</p></Card>
            <Card padding="none" className="p-4"><p className="text-xs text-gray-500">✅ Erhalten</p><p className="text-xl font-bold">{erhalten}</p></Card>
          </div>
          {liste.map((k) => (
            <Card key={k.agency_id} padding="none" className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-900">{k.name}</span>
                <span className="text-xs text-gray-500">{k.grund}</span>
                {k.roi !== null && <span className="text-xs text-gray-500">· ROI {k.roi.toLocaleString('de-DE', { maximumFractionDigits: 1 })}×</span>}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {ARTEN.map((a) => {
                  const st = k.stand[a.art];
                  return (
                    <div key={a.art} className="rounded-xl border border-gray-100 p-2.5">
                      <p className="mb-1.5 text-xs font-semibold text-gray-700">{a.label}{st?.empfohlen_name ? ` · ${st.empfohlen_name}` : ''}</p>
                      <div className="flex flex-wrap gap-1">
                        {STATUS.map((s) => (
                          <button
                            key={s.s}
                            onClick={() => setze(k, a.art, s.s)}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${(st?.status ?? 'vorgeschlagen') === s.s ? `${s.cls} ring-1 ring-gray-400` : 'text-gray-400 hover:text-gray-700'}`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
          {!liste.length && <Card padding="none" className="p-6 text-center text-sm text-gray-500">Noch keine Kandidaten – sobald Kunden in der Umfrage ≥ 8/10 geben und gute Ergebnisse haben, erscheinen sie hier.</Card>}
        </>
      )}
    </div>
  );
}
