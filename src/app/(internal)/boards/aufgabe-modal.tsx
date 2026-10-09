'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { AUFGABEN_STATUS, PRIORITAETEN, PRIO_LABEL, STATUS_LABEL } from '@/lib/aufgaben/konstanten';
import type { Aufgabe, BoardDaten } from './typen';
import { inputCls } from './typen';

/** Aufgabe ansehen und bearbeiten */
export function AufgabeModal({
  aufgabe,
  daten,
  onClose,
  onGespeichert,
  onGeloescht,
}: {
  aufgabe: Aufgabe;
  daten: BoardDaten;
  onClose: () => void;
  onGespeichert: (a: Aufgabe) => void;
  onGeloescht: (id: string) => void;
}) {
  const [f, setF] = useState({
    title: aufgabe.title,
    description: aufgabe.description ?? '',
    assigned_to: aufgabe.assigned_to ?? '',
    board_id: aufgabe.board_id ?? '',
    due_date: aufgabe.due_date ?? '',
    priority: aufgabe.priority,
    status: aufgabe.status === 'backlog' ? 'todo' : aufgabe.status,
  });
  const [speichert, setSpeichert] = useState(false);

  const speichern = async () => {
    setSpeichert(true);
    try {
      const r = await fetch(`/api/boards/aufgaben/${aufgabe.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, assigned_to: f.assigned_to || null, board_id: f.board_id || null, due_date: f.due_date || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Fehler');
      onGespeichert(j);
      toast.success('Gespeichert');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setSpeichert(false);
    }
  };

  const loeschen = async () => {
    if (!confirm('Aufgabe wirklich löschen?')) return;
    const r = await fetch(`/api/boards/aufgaben/${aufgabe.id}`, { method: 'DELETE' });
    if (!r.ok) return toast.error('Löschen fehlgeschlagen');
    onGeloescht(aufgabe.id);
    onClose();
  };

  const label = 'mb-1 block text-[12.5px] font-medium text-gray-600';
  return (
    <Modal open onClose={onClose} title="Aufgabe" width="max-w-xl">
      <div className="space-y-3">
        <div>
          <label className={label}>Titel</label>
          <input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <div>
          <label className={label}>Beschreibung</label>
          <textarea
            className="min-h-[110px] w-full rounded-lg border border-gray-300 bg-white p-3 text-sm"
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Zuständig</label>
            <select className={inputCls} value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}>
              <option value="">– niemand –</option>
              {daten.team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Board</label>
            <select className={inputCls} value={f.board_id} onChange={(e) => setF({ ...f, board_id: e.target.value })}>
              <option value="">– ohne –</option>
              {daten.boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Fällig am</label>
            <input type="date" className={inputCls} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
          </div>
          <div>
            <label className={label}>Priorität</label>
            <select className={inputCls} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as typeof f.priority })}>
              {PRIORITAETEN.map((p) => (
                <option key={p} value={p}>
                  {PRIO_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Status</label>
            <select className={inputCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as typeof f.status })}>
              {AUFGABEN_STATUS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          {aufgabe.agencies?.name && (
            <div>
              <label className={label}>Kunde</label>
              <p className="pt-2 text-sm">{aufgabe.agencies.name}</p>
            </div>
          )}
        </div>
        <p className="text-[12px] text-gray-500">
          Angelegt am {new Date(aufgabe.created_at).toLocaleString('de-DE')}
          {aufgabe.quelle && aufgabe.quelle !== 'manuell' ? ` · ${aufgabe.quelle === 'serie' ? 'wiederkehrend' : aufgabe.quelle === 'whatsapp' ? 'per WhatsApp-Sprachnachricht' : 'per Sprachnachricht'}` : ''}
        </p>
        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={loeschen} className="inline-flex items-center gap-1.5 text-[13px] text-red-700 hover:underline">
            <Trash2 className="h-4 w-4" /> Löschen
          </button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Abbrechen
            </Button>
            <Button onClick={speichern} disabled={speichert || !f.title.trim()}>
              Speichern
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
