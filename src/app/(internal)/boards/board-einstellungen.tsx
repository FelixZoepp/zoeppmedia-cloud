'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Archive } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import type { Board } from '@/lib/aufgaben/boards';
import { BOARD_FARBEN, inputCls } from './typen';

/** Board umbenennen, Farbe wählen, archivieren (persönliche Boards: nur Farbe) */
export function BoardEinstellungen({ board, onClose, onGespeichert }: { board: Board; onClose: () => void; onGespeichert: (b: Board) => void }) {
  const istTeam = !board.besitzer_id;
  const [f, setF] = useState({ name: board.name, beschreibung: board.beschreibung ?? '', farbe: board.farbe ?? '' });
  const [speichert, setSpeichert] = useState(false);

  const senden = async (patch: Record<string, unknown>) => {
    setSpeichert(true);
    try {
      const r = await fetch(`/api/boards/${board.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Fehler');
      onGespeichert(j);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setSpeichert(false);
    }
  };

  const label = 'mb-1 block text-[12.5px] font-medium text-gray-600';
  return (
    <Modal open onClose={onClose} title={istTeam ? 'Team-Board bearbeiten' : 'Board-Farbe'} width="max-w-md">
      <div className="space-y-3">
        {istTeam && (
          <>
            <div>
              <label htmlFor="board-name" className={label}>
                Name
              </label>
              <input id="board-name" className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="board-beschreibung" className={label}>
                Beschreibung
              </label>
              <input id="board-beschreibung" className={inputCls} placeholder="Wofür ist das Board?" value={f.beschreibung} onChange={(e) => setF({ ...f, beschreibung: e.target.value })} />
            </div>
          </>
        )}
        <div>
          <label className={label}>Farbe</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(BOARD_FARBEN).map(([k, cls]) => (
              <button
                key={k}
                type="button"
                onClick={() => setF({ ...f, farbe: k })}
                className={`h-8 w-8 rounded-full ${cls} ${f.farbe === k ? 'ring-2 ring-gray-900 ring-offset-2' : ''}`}
                aria-label={`Farbe ${k}`}
                aria-pressed={f.farbe === k}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between pt-2">
          {istTeam ? (
            <button
              type="button"
              disabled={speichert}
              onClick={() => confirm(`„${board.name}“ archivieren? Das geht nur, wenn keine offenen Aufgaben mehr darauf liegen. Das Board verschwindet aus der Liste und kann wiederhergestellt werden.`) && senden({ archiviert: true })}
              className="inline-flex items-center gap-1.5 text-[13px] text-red-700 hover:underline"
            >
              <Archive className="h-4 w-4" /> Archivieren
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Abbrechen
            </Button>
            <Button disabled={speichert || (istTeam && !f.name.trim())} onClick={() => senden(istTeam ? f : { farbe: f.farbe })}>
              Speichern
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
