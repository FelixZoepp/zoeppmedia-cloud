'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';

interface Bau {
  id: string;
  name: string;
  url: string | null;
  editor_url: string | null;
  bau_status: 'gestartet' | 'dupliziert' | 'texte_in_arbeit' | 'texte_fertig' | 'veroeffentlicht' | 'fehler';
  bau_fehler: string | null;
  auto_veroeffentlichen: boolean;
}

const LABEL: Record<Bau['bau_status'], string> = {
  gestartet: 'Vorlage wird kopiert …',
  dupliziert: 'Texte werden eingesetzt …',
  texte_in_arbeit: 'Perspective-KI setzt die Texte ein (bis ~5 Min.) …',
  texte_fertig: 'Fertig – wartet auf Veröffentlichen',
  veroeffentlicht: 'Live',
  fehler: 'Fehlgeschlagen',
};

const LAEUFT: Bau['bau_status'][] = ['gestartet', 'dupliziert', 'texte_in_arbeit'];

/** Funnel automatisch in Perspective bauen: Vorlage kopieren, Generator-Texte einsetzen, veröffentlichen. */
export function FunnelAutoBau({ agencyId }: { agencyId: string }) {
  const [bau, setBau] = useState<Bau | null>(null);
  const [konfiguriert, setKonfiguriert] = useState(true);
  const [direktLive, setDirektLive] = useState(true);
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async (weiter = false) => {
    const res = await fetch(`/api/admin/agencies/${agencyId}/funnel-bau${weiter ? '?weiter=1' : ''}`);
    if (!res.ok) return;
    const j = await res.json();
    setBau(j.bau);
    setKonfiguriert(j.konfiguriert);
  }, [agencyId]);

  useEffect(() => {
    let aktiv = true;
    fetch(`/api/admin/agencies/${agencyId}/funnel-bau`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!aktiv || !j) return;
        setBau(j.bau);
        setKonfiguriert(j.konfiguriert);
      })
      .catch(() => {});
    return () => {
      aktiv = false;
    };
  }, [agencyId]);

  // Läuft ein Bau, regelmäßig weiter nachsehen (die Abfrage treibt den Bau selbst voran)
  useEffect(() => {
    if (!bau || !LAEUFT.includes(bau.bau_status)) return;
    const t = setInterval(() => void laden(true), 30_000);
    return () => clearInterval(t);
  }, [bau, laden]);

  async function aktion(a: 'start' | 'veroeffentlichen' | 'neu_versuchen') {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/agencies/${agencyId}/funnel-bau`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktion: a, auto_veroeffentlichen: direktLive }),
      });
      const j = await res.json();
      if (!res.ok) toast.error(j.error ?? 'Fehlgeschlagen');
      else {
        if (j.bau) setBau(j.bau);
        toast.success(a === 'start' ? (j.neu ? 'Funnel-Bau gestartet' : 'Funnel-Bau läuft bereits') : 'Weiter geht’s');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="none" className="p-4 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-900">Funnel automatisch bauen</p>
          <p className="text-xs text-gray-500">Kopiert die Perspective-Vorlage, setzt die Funnel-Texte aus dem Generator ein und veröffentlicht.</p>
        </div>
        {!bau && (
          <button
            disabled={busy || !konfiguriert}
            onClick={() => void aktion('start')}
            className="h-9 px-3 rounded-full bg-gradient-to-b from-red-700 to-red-950 text-white text-sm font-semibold disabled:opacity-50 shrink-0"
          >
            Funnel bauen
          </button>
        )}
      </div>

      {!konfiguriert && <p className="text-xs text-amber-700 mt-2">PERSPECTIVE_API_KEY ist nicht gesetzt – Funnel bitte von Hand bauen.</p>}

      {!bau && konfiguriert && (
        <label className="flex items-center gap-2 text-xs text-gray-600 mt-2">
          <input type="checkbox" checked={direktLive} onChange={(e) => setDirektLive(e.target.checked)} />
          Nach Fertigstellung direkt veröffentlichen
        </label>
      )}

      {bau && (
        <div className="mt-3 text-sm space-y-1">
          <p>
            <span className="font-semibold">{bau.name}</span> · {LABEL[bau.bau_status]}
          </p>
          {bau.bau_fehler && <p className="text-xs text-red-600">{bau.bau_fehler}</p>}
          <div className="flex flex-wrap gap-3 text-xs">
            {bau.editor_url && <a className="text-red-600 hover:underline" href={bau.editor_url} target="_blank" rel="noreferrer">Im Editor öffnen</a>}
            {bau.url && <a className="text-red-600 hover:underline" href={bau.url} target="_blank" rel="noreferrer">Live ansehen</a>}
            {bau.bau_status === 'texte_fertig' && (
              <button disabled={busy} onClick={() => void aktion('veroeffentlichen')} className="font-semibold text-red-600 hover:underline">Jetzt veröffentlichen</button>
            )}
            {bau.bau_status === 'fehler' && (
              <button disabled={busy} onClick={() => void aktion('neu_versuchen')} className="font-semibold text-red-600 hover:underline">Erneut versuchen</button>
            )}
            {LAEUFT.includes(bau.bau_status) && (
              <button disabled={busy} onClick={() => void laden(true)} className="text-gray-500 hover:underline">Stand prüfen</button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
