'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArchiveRestore, Calendar, Check, CheckSquare, MessageSquare, MessageSquareText, Mic, Plus, Repeat, Search, Settings2, Users, X } from 'lucide-react';
import { Avatar, Button, Card, PageHeader, SegmentedControl } from '@/components/ui';
import { AUFGABEN_STATUS, STATUS_LABEL, type AufgabenStatus } from '@/lib/aufgaben/konstanten';
import type { Board } from '@/lib/aufgaben/boards';
import { AufgabeModal } from './aufgabe-modal';
import { DiktatModal } from './diktat-modal';
import { SerienBereich } from './serien-bereich';
import { BoardEinstellungen } from './board-einstellungen';
import type { Aufgabe, BoardDaten } from './typen';
import { BOARD_FARBEN, datumKurz, heuteIso, inputCls, plusTage, PRIO_FARBE } from './typen';
import { PRIORITAETEN, PRIO_LABEL } from '@/lib/aufgaben/konstanten';

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
  const [suche, setSuche] = useState('');
  const [filter, setFilter] = useState({ person: '', kunde: '', prio: '' });
  const [einstellungen, setEinstellungen] = useState(false);

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
  const sucheAktiv = !!(suche.trim() || filter.person || filter.kunde || filter.prio);
  const treffer = useMemo(() => {
    if (!d || !sucheAktiv) return [];
    const q = suche.trim().toLowerCase();
    return d.aufgaben
      .filter((a) => a.status !== 'done')
      .filter((a) => !q || a.title.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q) || (a.agencies?.name ?? '').toLowerCase().includes(q))
      .filter((a) => !filter.person || (filter.person === '__niemand' ? !a.assigned_to : a.assigned_to === filter.person))
      .filter((a) => !filter.kunde || a.agency_id === filter.kunde)
      .filter((a) => !filter.prio || a.priority === filter.prio)
      .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  }, [d, suche, filter, sucheAktiv]);
  const kunden = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of d?.aufgaben ?? []) if (a.agency_id && a.agencies?.name) m.set(a.agency_id, a.agencies.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [d]);
  const boardName = (a: Aufgabe) => {
    const b = d?.boards.find((x) => gehoertZu(a, x));
    return b ? (b.besitzer_id === d?.ich.id ? 'Mein Board' : b.name) : 'Nicht zugeordnet';
  };
  const darfEinstellen = (b: Board | null) => !!b && !!d && b.id !== OHNE_ID && (d.ich.role === 'admin' || (b.besitzer_id ? b.besitzer_id === d.ich.id : b.created_by === d.ich.id));
  const boardGespeichert = (b: Board) => {
    if (b.archiviert) setBoardId(d?.boards.find((x) => x.besitzer_id === d.ich.id)?.id ?? null);
    setD((alt) => {
      if (!alt) return alt;
      const ohne = alt.boards.filter((x) => x.id !== b.id);
      const arch = (alt.archiviert ?? []).filter((x) => x.id !== b.id);
      return b.archiviert ? { ...alt, boards: ohne, archiviert: [...arch, b] } : { ...alt, boards: [...ohne, b].sort((x, y) => x.sortierung - y.sortierung || x.name.localeCompare(y.name)), archiviert: arch };
    });
  };
  const wiederherstellen = async (b: Board) => {
    const r = await fetch(`/api/boards/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archiviert: false }) });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error ?? 'Fehler');
    boardGespeichert(j);
    setBoardId(j.id);
    toast.success(`„${j.name}“ wiederhergestellt`);
  };

  const ersetze = (a: Aufgabe) => setD((alt) => (alt ? { ...alt, aufgaben: alt.aufgaben.some((x) => x.id === a.id) ? alt.aufgaben.map((x) => (x.id === a.id ? { ...x, ...a } : x)) : [a, ...alt.aufgaben] } : alt));
  const setzeZaehler = (id: string, z: Partial<Aufgabe>) => setD((alt) => (alt ? { ...alt, aufgaben: alt.aufgaben.map((x) => (x.id === id ? { ...x, ...z } : x)) } : alt));

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
          {!!a.check_gesamt && (
            <span className={`inline-flex items-center gap-1 ${a.check_erledigt === a.check_gesamt ? 'text-green-700' : ''}`}>
              <CheckSquare className="h-3 w-3" /> {a.check_erledigt}/{a.check_gesamt}
            </span>
          )}
          {!!a.kommentare && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> {a.kommentare}
            </span>
          )}
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
        {p ? (
          <Avatar name={p.name} src={p.avatar_url} size={22} />
        ) : b.farbe && BOARD_FARBEN[b.farbe] ? (
          <span className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full ${BOARD_FARBEN[b.farbe]} text-white`}>
            <Users className="h-3 w-3" />
          </span>
        ) : (
          <Users className="h-[22px] w-[22px] flex-none rounded-full bg-gray-100 p-1 text-gray-500" />
        )}
        <span className="flex-1 truncate">{b.besitzer_id === d.ich.id ? 'Mein Board' : b.name}</span>
        {p && b.farbe && BOARD_FARBEN[b.farbe] && <span className={`h-2 w-2 rounded-full ${BOARD_FARBEN[b.farbe]}`} aria-hidden />}
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
          {!!d.archiviert?.length && (
            <details className="mt-3 px-2.5">
              <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-400">Archiviert ({d.archiviert.length})</summary>
              <div className="mt-1 space-y-0.5">
                {d.archiviert.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 py-1 text-[13px] text-gray-500">
                    <span className="flex-1 truncate">{b.name}</span>
                    {darfEinstellen(b) && (
                      <button type="button" onClick={() => wiederherstellen(b)} className="text-gray-400 hover:text-gray-800" aria-label={`${b.name} wiederherstellen`} title="Wiederherstellen">
                        <ArchiveRestore className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </Card>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input className={`${inputCls} pl-9`} placeholder="Alle Boards durchsuchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
            </div>
            <select className={`${inputCls} w-auto`} value={filter.person} onChange={(e) => setFilter({ ...filter, person: e.target.value })} aria-label="Person">
              <option value="">Alle Personen</option>
              <option value={d.ich.id}>Nur meine</option>
              {d.team
                .filter((t) => t.id !== d.ich.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              <option value="__niemand">Niemand zugewiesen</option>
            </select>
            <select className={`${inputCls} w-auto`} value={filter.kunde} onChange={(e) => setFilter({ ...filter, kunde: e.target.value })} aria-label="Kunde">
              <option value="">Alle Kunden</option>
              {kunden.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select className={`${inputCls} w-auto`} value={filter.prio} onChange={(e) => setFilter({ ...filter, prio: e.target.value })} aria-label="Priorität">
              <option value="">Jede Priorität</option>
              {PRIORITAETEN.map((p) => (
                <option key={p} value={p}>
                  {PRIO_LABEL[p]}
                </option>
              ))}
            </select>
            {sucheAktiv && (
              <button
                type="button"
                onClick={() => {
                  setSuche('');
                  setFilter({ person: '', kunde: '', prio: '' });
                }}
                className="inline-flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-900"
              >
                <X className="h-4 w-4" /> zurücksetzen
              </button>
            )}
          </div>

          {sucheAktiv && (
            <Card>
              <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-gray-500">{treffer.length} offene Aufgaben über alle Boards</p>
              {treffer.length === 0 && <p className="text-[14px] text-gray-500">Nichts gefunden.</p>}
              <ul className="divide-y divide-gray-100">
                {treffer.map((a) => {
                  const p = person(a.assigned_to);
                  const ueberfaellig = a.due_date && a.due_date < heute;
                  return (
                    <li key={a.id} className="flex items-center gap-3 py-2">
                      <input type="checkbox" className="h-4 w-4" checked={false} onChange={() => verschiebe(a.id, 'done')} aria-label="Erledigt" />
                      <span className={`h-2 w-2 flex-none rounded-full ${PRIO_FARBE[a.priority] ?? 'bg-gray-300'}`} aria-hidden />
                      <button type="button" onClick={() => setOffen(a)} className="min-w-0 flex-1 truncate text-left text-[14px] hover:text-red-700">
                        {a.title}
                        {a.agencies?.name && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[12px] text-gray-600">{a.agencies.name}</span>}
                      </button>
                      <span className="hidden text-[12px] text-gray-500 sm:inline">{boardName(a)}</span>
                      {p && <Avatar name={p.name} src={p.avatar_url} size={20} />}
                      <span className={`w-20 text-right text-[12px] ${ueberfaellig ? 'font-semibold text-red-700' : 'text-gray-500'}`}>{a.due_date ? (a.due_date === heute ? 'heute' : datumKurz(a.due_date)) : ''}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <div className={`flex flex-wrap items-center justify-between gap-2 ${sucheAktiv ? 'hidden' : ''}`}>
            <h2 className="flex items-center gap-2 text-[20px] font-medium tracking-[-0.02em]">
              {board ? (board.besitzer_id === d.ich.id ? 'Mein Board' : board.name) : '–'}
              {darfEinstellen(board) && (
                <button type="button" onClick={() => setEinstellungen(true)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-800" aria-label="Board bearbeiten" title="Board bearbeiten">
                  <Settings2 className="h-4 w-4" />
                </button>
              )}
            </h2>
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

          {board && board.beschreibung && !sucheAktiv && <p className="-mt-2 text-[13px] text-gray-500">{board.beschreibung}</p>}

          {board && ansicht !== 'serien' && !sucheAktiv && (
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

          {board && ansicht === 'board' && !sucheAktiv && (
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

          {board && ansicht === 'liste' && !sucheAktiv && (
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

          {board && ansicht === 'serien' && !sucheAktiv && board.id !== OHNE_ID && <SerienBereich board={board} daten={d} onAenderung={(serien) => setD({ ...d, serien })} />}
        </div>
      </div>

      {offen && (
        <AufgabeModal
          aufgabe={offen}
          daten={d}
          onClose={() => setOffen(null)}
          onGespeichert={ersetze}
          onGeloescht={(id) => setD({ ...d, aufgaben: d.aufgaben.filter((a) => a.id !== id) })}
          onZaehler={(z) => setzeZaehler(offen.id, z)}
        />
      )}
      {einstellungen && board && <BoardEinstellungen board={board} onClose={() => setEinstellungen(false)} onGespeichert={boardGespeichert} />}
      {diktat && <DiktatModal daten={d} onClose={() => setDiktat(false)} onAngelegt={() => void laden()} />}
    </div>
  );
}
