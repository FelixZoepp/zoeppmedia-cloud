'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Calendar, Check, MessageSquareText, Mic, Plus, Repeat, Users } from 'lucide-react';
import { Avatar, Button, Card, PageHeader, SegmentedControl } from '@/components/ui';
import { AUFGABEN_STATUS, STATUS_LABEL, type AufgabenStatus } from '@/lib/aufgaben/konstanten';
import type { Board } from '@/lib/aufgaben/boards';
import { AufgabeModal } from './aufgabe-modal';
import { DiktatModal } from './diktat-modal';
import { SerienBereich } from './serien-bereich';
import type { Aufgabe, BoardDaten } from './typen';
import { datumKurz, heuteIso, inputCls, plusTage, PRIO_FARBE } from './typen';

const SPALTE_FARBE: Record<AufgabenStatus, string> = { todo: 'bg-gray-50', in_progress: 'bg-sky-50/60', review: 'bg-amber-50/60', done: 'bg-green-50/60' };

/** Virtuelles Board für Admins: Aufgaben ohne Board und ohne Zuständigen (z. B. automatische Aufgaben) */
const OHNE_ID = '__ohne';
const OHNE_BOARD: Board = { id: OHNE_ID, name: 'Nicht zugeordnet', besitzer_id: null, beschreibung: null, farbe: null, sortierung: 999 };

function gehoertZu(a: Aufgabe, b: Board) {
  if (b.id === OHNE_ID) return !a.board_id && !a.assigned_to;
  return a.board_id === b.id || (!a.board_id && !!b.besitzer_id && a.assigned_to === b.besitzer_id);
}

export function BoardsClient() {
  const [d, setD] = useState<BoardDaten | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState('board');
  const [offen, setOffen] = useState<Aufgabe | null>(null);
  const [diktat, setDiktat] = useState(false);
  const [neuTitel, setNeuTitel] = useState('');
  const [ziehe, setZiehe] = useState<string | null>(null);

  const anwenden = useCallback((j: BoardDaten) => {
    setD(j);
    setBoardId((alt) => alt ?? j.boards.find((b) => b.besitzer_id === j.ich.id)?.id ?? j.boards[0]?.id ?? null);
    // Link aus der Benachrichtigung: /boards?aufgabe=<id>
    const id = new URLSearchParams(window.location.search).get('aufgabe');
    const a = id ? j.aufgaben.find((x) => x.id === id) : null;
    if (a) {
      setOffen(a);
      const b = j.boards.find((x) => gehoertZu(a, x));
      if (b) setBoardId(b.id);
    }
  }, []);

  const laden = useCallback(async () => {
    const r = await fetch('/api/boards', { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error ?? 'Boards konnten nicht geladen werden');
    anwenden(j);
  }, [anwenden]);

  useEffect(() => {
    let aktiv = true;
    fetch('/api/boards', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Boards konnten nicht geladen werden');
        if (aktiv) anwenden(j);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Fehler'));
    return () => {
      aktiv = false;
    };
  }, [anwenden]);

  const alleBoards = useMemo(() => (d ? (d.ich.role === 'admin' ? [...d.boards, OHNE_BOARD] : d.boards) : []), [d]);
  const board = alleBoards.find((b) => b.id === boardId) ?? null;
  const aufgaben = useMemo(() => (d && board ? d.aufgaben.filter((a) => gehoertZu(a, board)) : []), [d, board]);
  const offeneZahl = (b: Board) => (d ? d.aufgaben.filter((a) => a.status !== 'done' && gehoertZu(a, b)).length : 0);
  const person = (id: string | null) => d?.team.find((t) => t.id === id) ?? null;

  const ersetze = (a: Aufgabe) => setD((alt) => (alt ? { ...alt, aufgaben: alt.aufgaben.some((x) => x.id === a.id) ? alt.aufgaben.map((x) => (x.id === a.id ? a : x)) : [a, ...alt.aufgaben] } : alt));

  const verschiebe = async (id: string, status: AufgabenStatus) => {
    const a = d?.aufgaben.find((x) => x.id === id);
    if (!a || a.status === status) return;
    ersetze({ ...a, status, erledigt_am: status === 'done' ? new Date().toISOString() : null });
    const r = await fetch(`/api/boards/aufgaben/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!r.ok) {
      toast.error('Konnte nicht verschieben');
      ersetze(a);
    }
  };

  const schnellAnlegen = async () => {
    if (!board || !neuTitel.trim()) return;
    const r = await fetch('/api/boards/aufgaben', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: neuTitel, board_id: board.id === OHNE_ID ? null : board.id, assigned_to: board.besitzer_id }),
    });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error ?? 'Fehler');
    ersetze(j);
    setNeuTitel('');
  };

  const neuesTeamBoard = async () => {
    const name = prompt('Name des Team-Boards (z. B. „Kundensupport“):');
    if (!name?.trim()) return;
    const r = await fetch('/api/boards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error ?? 'Fehler');
    setD((alt) => (alt ? { ...alt, boards: [...alt.boards, j] } : alt));
    setBoardId(j.id);
  };

  if (!d) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
      </div>
    );
  }

  const meins = d.boards.filter((b) => b.besitzer_id === d.ich.id);
  const team = alleBoards.filter((b) => !b.besitzer_id);
  const andere = d.boards.filter((b) => b.besitzer_id && b.besitzer_id !== d.ich.id);
  const heute = heuteIso();

  const Karte = ({ a }: { a: Aufgabe }) => {
    const p = person(a.assigned_to);
    const ueberfaellig = a.due_date && a.due_date < heute && a.status !== 'done';
    return (
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={() => setZiehe(a.id)}
        onDragEnd={() => setZiehe(null)}
        onClick={() => setOffen(a)}
        onKeyDown={(e) => e.key === 'Enter' && setOffen(a)}
        className={`w-full rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:border-gray-300 ${ziehe === a.id ? 'opacity-40' : ''}`}
      >
        <div className="flex items-start gap-2">
          <span
            role="checkbox"
            aria-checked={a.status === 'done'}
            aria-label={a.status === 'done' ? 'Wieder öffnen' : 'Erledigt'}
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              void verschiebe(a.id, a.status === 'done' ? 'todo' : 'done');
            }}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                void verschiebe(a.id, a.status === 'done' ? 'todo' : 'done');
              }
            }}
            className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border ${a.status === 'done' ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 hover:border-green-600'}`}
          >
            {a.status === 'done' && <Check className="h-3 w-3" />}
          </span>
          <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${PRIO_FARBE[a.priority] ?? 'bg-gray-300'}`} aria-hidden />
          <p className={`flex-1 text-[14px] leading-snug ${a.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{a.title}</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-gray-500">
          {a.due_date && (
            <span className={`inline-flex items-center gap-1 ${ueberfaellig ? 'font-semibold text-red-700' : a.due_date === heute ? 'font-semibold text-amber-700' : ''}`}>
              <Calendar className="h-3 w-3" /> {a.due_date === heute ? 'heute' : datumKurz(a.due_date)}
            </span>
          )}
          {a.agencies?.name && <span className="truncate rounded bg-gray-100 px-1.5 py-0.5">{a.agencies.name}</span>}
          {a.serie_id && <Repeat className="h-3 w-3" aria-label="wiederkehrend" />}
          {(a.quelle === 'sprachnachricht' || a.quelle === 'whatsapp') && <MessageSquareText className="h-3 w-3" aria-label="per Sprachnachricht" />}
          {p && board?.besitzer_id !== p.id && (
            <span className="ml-auto">
              <Avatar name={p.name} src={p.avatar_url} size={20} />
            </span>
          )}
        </div>
      </div>
    );
  };

  const gruppen: Array<{ titel: string; liste: Aufgabe[] }> = (() => {
    const offeneA = aufgaben.filter((a) => a.status !== 'done');
    const wocheEnde = plusTage(heute, 7);
    return [
      { titel: 'Überfällig', liste: offeneA.filter((a) => a.due_date && a.due_date < heute) },
      { titel: 'Heute', liste: offeneA.filter((a) => a.due_date === heute) },
      { titel: 'Nächste 7 Tage', liste: offeneA.filter((a) => a.due_date && a.due_date > heute && a.due_date <= wocheEnde) },
      { titel: 'Später', liste: offeneA.filter((a) => a.due_date && a.due_date > wocheEnde) },
      { titel: 'Ohne Datum', liste: offeneA.filter((a) => !a.due_date) },
    ].filter((g) => g.liste.length);
  })();

  const BoardKnopf = ({ b }: { b: Board }) => {
    const p = b.besitzer_id ? person(b.besitzer_id) : null;
    const n = offeneZahl(b);
    return (
      <button
        type="button"
        onClick={() => setBoardId(b.id)}
        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[14px] ${b.id === boardId ? 'bg-red-50 font-semibold text-red-800' : 'text-gray-700 hover:bg-gray-50'}`}
      >
        {p ? <Avatar name={p.name} src={p.avatar_url} size={22} /> : <Users className="h-[22px] w-[22px] flex-none rounded-full bg-gray-100 p-1 text-gray-500" />}
        <span className="flex-1 truncate">{b.besitzer_id === d.ich.id ? 'Mein Board' : b.name}</span>
        {n > 0 && <span className="text-[12px] text-gray-500">{n}</span>}
      </button>
    );
  };

  return (
    <div>
      <PageHeader
        title="Boards"
        description="Aufgaben für dich und dein Team – einmalig oder wiederkehrend, auch per Sprachnachricht."
        action={
          <Button onClick={() => setDiktat(true)}>
            <Mic className="h-4 w-4" /> Per Sprache
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        <Card padding="sm">
          <div className="space-y-0.5">
            {meins.map((b) => (
              <BoardKnopf key={b.id} b={b} />
            ))}
          </div>
          <p className="mb-1 mt-3 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Team-Boards</p>
          <div className="space-y-0.5">
            {team.map((b) => (
              <BoardKnopf key={b.id} b={b} />
            ))}
            <button type="button" onClick={neuesTeamBoard} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-gray-500 hover:bg-gray-50">
              <Plus className="h-4 w-4" /> Team-Board
            </button>
          </div>
          <p className="mb-1 mt-3 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Mitarbeiter</p>
          <div className="space-y-0.5">
            {andere.map((b) => (
              <BoardKnopf key={b.id} b={b} />
            ))}
          </div>
        </Card>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[20px] font-medium tracking-[-0.02em]">{board ? (board.besitzer_id === d.ich.id ? 'Mein Board' : board.name) : '–'}</h2>
            <SegmentedControl
              items={[
                { value: 'board', label: 'Board' },
                { value: 'liste', label: 'Liste' },
                { value: 'serien', label: 'Wiederkehrend' },
              ]}
              value={ansicht}
              onChange={setAnsicht}
            />
          </div>

          {board && ansicht !== 'serien' && (
            <div className="flex gap-2">
              <input
                className={inputCls}
                placeholder={board.besitzer_id && board.besitzer_id !== d.ich.id ? `Neue Aufgabe für ${board.name} …` : 'Neue Aufgabe … (Enter)'}
                value={neuTitel}
                onChange={(e) => setNeuTitel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && schnellAnlegen()}
              />
              <Button onClick={schnellAnlegen} disabled={!neuTitel.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}

          {board && ansicht === 'board' && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {AUFGABEN_STATUS.map((s) => {
                const liste = aufgaben.filter((a) => (a.status === 'backlog' ? 'todo' : a.status) === s);
                return (
                  <div
                    key={s}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => ziehe && verschiebe(ziehe, s)}
                    className={`min-h-[200px] rounded-2xl p-2.5 ${SPALTE_FARBE[s]}`}
                  >
                    <p className="mb-2 flex items-center justify-between px-1 text-[12.5px] font-semibold uppercase tracking-wide text-gray-500">
                      {STATUS_LABEL[s]} <span>{liste.length}</span>
                    </p>
                    <div className="space-y-2">
                      {liste.map((a) => (
                        <Karte key={a.id} a={a} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {board && ansicht === 'liste' && (
            <Card>
              {gruppen.length === 0 && <p className="text-[14px] text-gray-500">Keine offenen Aufgaben 🎉</p>}
              {gruppen.map((g) => (
                <div key={g.titel} className="mb-4 last:mb-0">
                  <p className={`mb-1.5 text-[12.5px] font-semibold uppercase tracking-wide ${g.titel === 'Überfällig' ? 'text-red-700' : 'text-gray-500'}`}>
                    {g.titel} · {g.liste.length}
                  </p>
                  <ul className="divide-y divide-gray-100">
                    {g.liste.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 py-2">
                        <input type="checkbox" className="h-4 w-4" checked={false} onChange={() => verschiebe(a.id, 'done')} aria-label="Erledigt" />
                        <button type="button" onClick={() => setOffen(a)} className="min-w-0 flex-1 truncate text-left text-[14px] hover:text-red-700">
                          {a.title}
                        </button>
                        <span className="text-[12px] text-gray-500">{STATUS_LABEL[(a.status === 'backlog' ? 'todo' : a.status) as AufgabenStatus]}</span>
                        {a.due_date && <span className="w-20 text-right text-[12px] text-gray-500">{datumKurz(a.due_date)}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Card>
          )}

          {board && ansicht === 'serien' && board.id !== OHNE_ID && <SerienBereich board={board} daten={d} onAenderung={(serien) => setD({ ...d, serien })} />}
        </div>
      </div>

      {offen && (
        <AufgabeModal
          aufgabe={offen}
          daten={d}
          onClose={() => setOffen(null)}
          onGespeichert={ersetze}
          onGeloescht={(id) => setD({ ...d, aufgaben: d.aufgaben.filter((a) => a.id !== id) })}
        />
      )}
      {diktat && <DiktatModal daten={d} onClose={() => setDiktat(false)} onAngelegt={() => void laden()} />}
    </div>
  );
}
