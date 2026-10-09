'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Send, X } from 'lucide-react';
import { Avatar } from '@/components/ui';
import type { BoardDaten } from './typen';
import { inputCls } from './typen';

interface Punkt {
  id: string;
  text: string;
  erledigt: boolean;
  position: number;
}
interface Kommentar {
  id: string;
  user_id: string | null;
  text: string;
  created_at: string;
}

/** Checkliste und Verlauf (Kommentare) einer Aufgabe; meldet Zähler-Änderungen an die Karte */
export function AufgabeDetails({
  aufgabeId,
  daten,
  onZaehler,
}: {
  aufgabeId: string;
  daten: BoardDaten;
  onZaehler: (z: { check_gesamt: number; check_erledigt: number; kommentare: number }) => void;
}) {
  const [punkte, setPunkte] = useState<Punkt[] | null>(null);
  const [kommentare, setKommentare] = useState<Kommentar[]>([]);
  const [neuPunkt, setNeuPunkt] = useState('');
  const [neuKommentar, setNeuKommentar] = useState('');
  const [sendet, setSendet] = useState(false);

  useEffect(() => {
    let aktiv = true;
    fetch(`/api/boards/aufgaben/${aufgabeId}/details`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Fehler');
        if (!aktiv) return;
        setPunkte(j.checkliste);
        setKommentare(j.kommentare);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Details nicht ladbar'));
    return () => {
      aktiv = false;
    };
  }, [aufgabeId]);

  // Zähler an die Karte melden, sobald sich Checkliste oder Verlauf ändern
  const meldeRef = useRef(onZaehler);
  useEffect(() => {
    meldeRef.current = onZaehler;
  });
  useEffect(() => {
    if (punkte) meldeRef.current({ check_gesamt: punkte.length, check_erledigt: punkte.filter((x) => x.erledigt).length, kommentare: kommentare.length });
  }, [punkte, kommentare]);

  const punktAnlegen = async () => {
    const text = neuPunkt.trim();
    if (!text || !punkte) return;
    setNeuPunkt('');
    const r = await fetch(`/api/boards/aufgaben/${aufgabeId}/checkliste`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error ?? 'Fehler');
    setPunkte((alt) => [...(alt ?? []), j]);
  };

  const punktAendern = async (p: Punkt, patch: Partial<Punkt>) => {
    const vorher = { ...p };
    setPunkte((alt) => (alt ?? []).map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
    const r = await fetch(`/api/boards/checkliste/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (!r.ok) {
      toast.error('Nicht gespeichert');
      setPunkte((alt) => (alt ?? []).map((x) => (x.id === p.id ? vorher : x)));
    }
  };

  const punktLoeschen = async (p: Punkt) => {
    const r = await fetch(`/api/boards/checkliste/${p.id}`, { method: 'DELETE' });
    if (!r.ok) return toast.error('Nicht gelöscht');
    setPunkte((alt) => (alt ?? []).filter((x) => x.id !== p.id));
  };

  const kommentieren = async () => {
    const text = neuKommentar.trim();
    if (!text || sendet) return;
    setSendet(true);
    try {
      const r = await fetch(`/api/boards/aufgaben/${aufgabeId}/kommentare`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Fehler');
      setKommentare((alt) => [...alt, j]);
      setNeuKommentar('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setSendet(false);
    }
  };

  const person = (id: string | null) => daten.team.find((t) => t.id === id);
  const label = 'mb-1.5 flex items-center justify-between text-[12.5px] font-medium text-gray-600';
  if (!punkte) return <p className="py-3 text-[13px] text-gray-400">Lade Checkliste und Verlauf …</p>;
  const erledigt = punkte.filter((p) => p.erledigt).length;

  return (
    <div className="space-y-4 border-t border-gray-100 pt-3">
      <div>
        <p className={label}>
          Checkliste {punkte.length > 0 && <span className="text-gray-500">{erledigt}/{punkte.length}</span>}
        </p>
        {punkte.length > 0 && (
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-green-600 transition-all" style={{ width: `${(erledigt / punkte.length) * 100}%` }} />
          </div>
        )}
        <ul className="space-y-1">
          {punkte.map((p) => (
            <li key={p.id} className="group flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={p.erledigt} onChange={() => punktAendern(p, { erledigt: !p.erledigt })} aria-label={p.text} />
              <span className={`flex-1 text-[14px] ${p.erledigt ? 'text-gray-400 line-through' : ''}`}>{p.text}</span>
              <button type="button" onClick={() => punktLoeschen(p)} className="text-gray-300 hover:text-red-700 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Punkt löschen">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <input
          className={`${inputCls} mt-1.5 h-9`}
          placeholder="Unteraufgabe hinzufügen … (Enter)"
          value={neuPunkt}
          onChange={(e) => setNeuPunkt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void punktAnlegen();
            }
          }}
        />
      </div>

      <div>
        <p className={label}>Verlauf</p>
        {kommentare.length === 0 && <p className="text-[13px] text-gray-400">Noch keine Kommentare.</p>}
        <ul className="max-h-60 space-y-2.5 overflow-y-auto">
          {kommentare.map((k) => {
            const p = person(k.user_id);
            return (
              <li key={k.id} className="flex gap-2">
                <Avatar name={p?.name ?? '?'} src={p?.avatar_url ?? null} size={24} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-gray-500">
                    <span className="font-medium text-gray-800">{p?.name ?? 'Unbekannt'}</span> · {new Date(k.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="whitespace-pre-wrap text-[14px]">{k.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex gap-2">
          <textarea
            className="min-h-[40px] flex-1 rounded-lg border border-gray-300 bg-white p-2 text-sm"
            rows={1}
            placeholder="Kommentar schreiben … (Strg/⌘ + Enter)"
            value={neuKommentar}
            onChange={(e) => setNeuKommentar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void kommentieren();
              }
            }}
          />
          <button type="button" onClick={kommentieren} disabled={!neuKommentar.trim() || sendet} className="rounded-lg bg-red-700 px-3 text-white disabled:opacity-40" aria-label="Kommentar senden">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
