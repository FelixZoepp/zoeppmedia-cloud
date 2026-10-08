'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';

interface Status {
  verbunden: boolean;
  status: 'getrennt' | 'verbunden' | 'abgelaufen' | 'api_key';
  seit: string | null;
  companyId: string | null;
  fehler: string | null;
}

const datum = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

/** Perspective per OAuth verbinden (für den automatischen Funnel-Bau). `kompakt` = nur Hinweis + Knopf. */
export function PerspectiveVerbindung({ kompakt = false, onVerbunden }: { kompakt?: boolean; onVerbunden?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [manuell, setManuell] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let aktiv = true;
    fetch('/api/perspective/oauth/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => aktiv && j && setStatus(j))
      .catch(() => {});
    // Rückmeldung aus dem OAuth-Rücksprung (?perspective=verbunden|fehler) einmal anzeigen
    const p = new URLSearchParams(window.location.search);
    const ergebnis = p.get('perspective');
    if (ergebnis) {
      if (ergebnis === 'verbunden') toast.success('Perspective verbunden');
      else toast.error(`Perspective: ${p.get('grund') ?? 'Verbindung fehlgeschlagen'}`);
      p.delete('perspective');
      p.delete('grund');
      const rest = p.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
    return () => {
      aktiv = false;
    };
  }, []);

  const zurueck = () => encodeURIComponent(window.location.pathname);

  function verbinden() {
    window.location.href = `/api/perspective/oauth/start?zurueck=${zurueck()}`;
  }

  function manuellStarten() {
    setManuell(true);
    window.open(`/api/perspective/oauth/start?modus=manuell&zurueck=${zurueck()}`, '_blank', 'noopener');
  }

  async function manuellEinloesen() {
    setBusy(true);
    try {
      const res = await fetch('/api/perspective/oauth/manuell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? 'Fehlgeschlagen');
        return;
      }
      toast.success('Perspective verbunden');
      setManuell(false);
      setUrl('');
      const s = await fetch('/api/perspective/oauth/status').then((r) => r.json());
      setStatus(s);
      onVerbunden?.();
    } finally {
      setBusy(false);
    }
  }

  async function trennenKlick() {
    if (!confirm('Perspective-Verbindung trennen? Danach baut die Cloud keine Funnels mehr automatisch.')) return;
    const res = await fetch('/api/perspective/oauth/status', { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok) toast.error(j.error ?? 'Fehlgeschlagen');
    else setStatus(j);
  }

  if (!status) return null;
  if (kompakt && status.verbunden) return null;

  const knopf = 'h-9 px-3 rounded-full text-sm font-semibold disabled:opacity-50 shrink-0';

  const inhalt = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-900">Perspective</p>
          {status.status === 'verbunden' && (
            <p className="text-xs text-gray-500">
              Verbunden seit {datum(status.seit)}
              {status.companyId ? ` · Workspace ${status.companyId}` : ''}
            </p>
          )}
          {status.status === 'api_key' && <p className="text-xs text-gray-500">Verbunden über PERSPECTIVE_API_KEY</p>}
          {status.status === 'abgelaufen' && (
            <p className="text-xs text-amber-700">Verbindung abgelaufen{status.fehler ? ` (${status.fehler})` : ''} – bitte neu verbinden.</p>
          )}
          {status.status === 'getrennt' && <p className="text-xs text-gray-500">Nicht verbunden – ohne Verbindung baut die Cloud keine Funnels automatisch.</p>}
        </div>
        {status.status === 'verbunden' ? (
          <button onClick={() => void trennenKlick()} className={`${knopf} border border-gray-200 text-gray-700`}>
            Trennen
          </button>
        ) : (
          status.status !== 'api_key' && (
            <button onClick={verbinden} className={`${knopf} bg-gradient-to-b from-red-700 to-red-950 text-white`}>
              Perspective verbinden
            </button>
          )
        )}
      </div>

      {!status.verbunden && (
        <div className="mt-2 text-xs text-gray-500">
          {!manuell ? (
            <button onClick={manuellStarten} className="text-red-600 hover:underline">
              Weiterleitung klappt nicht? Manuell verbinden
            </button>
          ) : (
            <div className="space-y-2">
              <p>
                Im neuen Tab bei Perspective anmelden. Danach lädt eine Seite unter <code>localhost</code> nicht – das ist richtig. Die komplette
                Adresse aus der Adresszeile hier einfügen:
              </p>
              <div className="flex gap-2">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://localhost:33418/callback?code=…&state=…"
                  className="flex-1 h-9 rounded-lg border border-gray-200 px-2 text-sm"
                />
                <button
                  disabled={busy || !url.trim()}
                  onClick={() => void manuellEinloesen()}
                  className={`${knopf} bg-gradient-to-b from-red-700 to-red-950 text-white`}
                >
                  Verbinden
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  return kompakt ? <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">{inhalt}</div> : <Card padding="none" className="p-4 mb-4">{inhalt}</Card>;
}
