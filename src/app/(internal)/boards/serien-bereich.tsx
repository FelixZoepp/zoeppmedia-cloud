'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Pause, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { PRIORITAETEN, PRIO_LABEL } from '@/lib/aufgaben/konstanten';
import { regelText, WOCHENTAGE, type Rhythmus } from '@/lib/aufgaben/regeln';
import type { Board } from '@/lib/aufgaben/boards';
import type { BoardDaten, Serie } from './typen';
import { datumKurz, inputCls } from './typen';

/** Wiederkehrende Aufgaben eines Boards: anlegen, pausieren, löschen */
export function SerienBereich({ board, daten, onAenderung }: { board: Board; daten: BoardDaten; onAenderung: (serien: Serie[]) => void }) {
  const serien = daten.serien.filter((s) => s.board_id === board.id || (!s.board_id && s.assigned_to === board.besitzer_id));
  const [neu, setNeu] = useState({ title: '', assigned_to: board.besitzer_id ?? '', rhythmus: 'woechentlich' as Rhythmus, wochentag: 1, monatstag: 1, nur_werktags: true, priority: 'medium' });
  const [offen, setOffen] = useState(false);
  const name = (id: string | null) => daten.team.find((t) => t.id === id)?.name ?? '–';

  const anlegen = async () => {
    const r = await fetch('/api/boards/serien', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...neu, board_id: board.id }) });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error ?? 'Fehler');
    onAenderung([j, ...daten.serien]);
    setNeu({ ...neu, title: '' });
    setOffen(false);
    toast.success('Wiederkehrende Aufgabe angelegt');
  };

  const umschalten = async (s: Serie) => {
    const r = await fetch(`/api/boards/serien/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktiv: !s.aktiv }) });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error ?? 'Fehler');
    onAenderung(daten.serien.map((x) => (x.id === s.id ? j : x)));
  };

  const loeschen = async (s: Serie) => {
    if (!confirm(`„${s.title}“ wirklich löschen? Bereits angelegte Aufgaben bleiben.`)) return;
    const r = await fetch(`/api/boards/serien/${s.id}`, { method: 'DELETE' });
    if (!r.ok) return toast.error('Löschen fehlgeschlagen');
    onAenderung(daten.serien.filter((x) => x.id !== s.id));
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-medium">Wiederkehrende Aufgaben</h2>
          <p className="text-[13px] text-gray-600">Werden automatisch am Fälligkeitstag aufs Board gelegt – täglich, wöchentlich oder monatlich.</p>
        </div>
        <Button onClick={() => setOffen(!offen)}>
          <Plus className="h-4 w-4" /> Neu
        </Button>
      </div>

      {offen && (
        <div className="mt-3 grid gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-2">
          <input className={`${inputCls} sm:col-span-2`} placeholder="Was ist zu tun? z. B. „Kunden-Reports verschicken“" value={neu.title} onChange={(e) => setNeu({ ...neu, title: e.target.value })} />
          <select className={inputCls} value={neu.assigned_to} onChange={(e) => setNeu({ ...neu, assigned_to: e.target.value })}>
            {daten.team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select className={inputCls} value={neu.rhythmus} onChange={(e) => setNeu({ ...neu, rhythmus: e.target.value as Rhythmus })}>
            <option value="taeglich">Täglich</option>
            <option value="woechentlich">Wöchentlich</option>
            <option value="monatlich">Monatlich</option>
          </select>
          {neu.rhythmus === 'woechentlich' && (
            <select className={inputCls} value={neu.wochentag} onChange={(e) => setNeu({ ...neu, wochentag: Number(e.target.value) })}>
              {WOCHENTAGE.map((w, i) => (
                <option key={w} value={i + 1}>
                  {w}
                </option>
              ))}
            </select>
          )}
          {neu.rhythmus === 'monatlich' && (
            <select className={inputCls} value={neu.monatstag} onChange={(e) => setNeu({ ...neu, monatstag: Number(e.target.value) })}>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i} value={i + 1}>
                  am {i + 1}.
                </option>
              ))}
            </select>
          )}
          <select className={inputCls} value={neu.priority} onChange={(e) => setNeu({ ...neu, priority: e.target.value })}>
            {PRIORITAETEN.map((p) => (
              <option key={p} value={p}>
                Priorität: {PRIO_LABEL[p]}
              </option>
            ))}
          </select>
          {neu.rhythmus !== 'woechentlich' && (
            <label className="flex items-center gap-2 text-[13px] text-gray-700">
              <input type="checkbox" checked={neu.nur_werktags} onChange={(e) => setNeu({ ...neu, nur_werktags: e.target.checked })} /> nur Werktage (Mo–Fr)
            </label>
          )}
          <div className="flex justify-end sm:col-span-2">
            <Button onClick={anlegen} disabled={!neu.title.trim()}>
              Anlegen
            </Button>
          </div>
        </div>
      )}

      <ul className="mt-3 divide-y divide-gray-100">
        {serien.length === 0 && <li className="py-3 text-[14px] text-gray-500">Noch keine wiederkehrenden Aufgaben auf diesem Board.</li>}
        {serien.map((s) => (
          <li key={s.id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${s.aktiv ? '' : 'opacity-50'}`}>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[14px] font-medium">
                <Repeat className="h-3.5 w-3.5 flex-none text-gray-400" /> {s.title}
              </p>
              <p className="text-[12.5px] text-gray-500">
                {regelText(s)} · {name(s.assigned_to)} · {s.aktiv ? `nächstes Mal ${datumKurz(s.naechste_am)}` : 'pausiert'}
              </p>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => umschalten(s)} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100" aria-label={s.aktiv ? 'Pausieren' : 'Fortsetzen'}>
                {s.aktiv ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => loeschen(s)} className="rounded-lg p-2 text-red-700 hover:bg-red-50" aria-label="Löschen">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
