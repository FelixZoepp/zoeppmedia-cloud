'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Keyboard, Loader2, PencilLine, X } from 'lucide-react';
import { zeitText } from '@/lib/videos/konstanten';
import type { FreigabeDaten } from '@/lib/videos/freigabe';
import { KUERZEL, useTastenkuerzel } from './tastenkuerzel';
import { Zeitleiste, zeitLabel } from './zeitleiste';

const NAME_KEY = 'zm_freigabe_name';

/** Öffentliche Kundenseite: Video ansehen, zeitgenau kommentieren, freigeben oder Änderungen wünschen */
export function KundenFreigabe({ start }: { start: FreigabeDaten }) {
  const [d, setD] = useState(start);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [zeit, setZeit] = useState(0);
  const [dauer, setDauer] = useState<number | null>(start.dauer_s);
  const [von, setVon] = useState<number | null>(null);
  const [bis, setBis] = useState<number | null>(null);
  const [mitZeit, setMitZeit] = useState(true);
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [entscheidung, setEntscheidung] = useState<'freigegeben' | 'aenderungen' | null>(null);
  const [notiz, setNotiz] = useState('');
  const [kuerzel, setKuerzel] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const feld = useRef<HTMLTextAreaElement>(null);

  // Name merken (nur in diesem Browser)
  useEffect(() => {
    try {
      const n = localStorage.getItem(NAME_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- einmalig aus dem Browser-Speicher
      if (n) setName(n);
    } catch {
      /* Speicher gesperrt */
    }
  }, []);
  const merkeName = (n: string) => {
    setName(n);
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch {
      /* egal */
    }
  };

  useTastenkuerzel(player, {
    onKommentar: () => {
      setVon(player.current?.currentTime ?? zeit);
      setMitZeit(true);
      feld.current?.focus();
    },
    onAnfang: (s) => {
      setVon(s);
      setBis(null);
    },
    onEnde: (s) => {
      setVon((a) => (a !== null && a < s ? a : Math.max(0, s - 2)));
      setBis(s);
    },
  });

  const senden = async (body: Record<string, unknown>) => {
    setSendet(true);
    setFehler(null);
    try {
      const r = await fetch(`/api/freigabe/${d.token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, name, version_id: d.versionId }) });
      const j = await r.json();
      if (r.status === 409 && j.neu_laden) {
        window.location.reload();
        return null;
      }
      if (!r.ok) throw new Error(j.error ?? 'Fehler');
      return j;
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Fehler');
      return null;
    } finally {
      setSendet(false);
    }
  };

  const kommentieren = async () => {
    if (!text.trim() || !name.trim()) return;
    const zeitS = mitZeit ? (von ?? zeit) : null;
    const j = await senden({ aktion: 'kommentar', text, zeit_s: zeitS, zeit_bis_s: zeitS !== null && bis !== null && bis > zeitS ? bis : null });
    if (!j) return;
    setD((alt) => ({ ...alt, kommentare: [...alt.kommentare, j].sort((a, b) => (a.zeit_s ?? -1) - (b.zeit_s ?? -1)) }));
    setText('');
    setVon(null);
    setBis(null);
  };

  const entscheiden = async () => {
    if (!entscheidung || !name.trim()) return;
    const j = await senden({ aktion: 'entscheidung', entscheidung, text: notiz });
    if (!j) return;
    setD((alt) => ({ ...alt, video: { ...alt.video, kunden_status: entscheidung } }));
    setEntscheidung(null);
    setNotiz('');
  };

  const springe = (s: number | null) => {
    if (s === null || !player.current) return;
    player.current.currentTime = s;
    player.current.pause();
  };

  const laenge = dauer ?? null;
  const st = d.video.kunden_status;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">Zoepp Media · Video-Freigabe</p>
            <h1 className="truncate text-[19px] font-semibold text-gray-900">{d.video.titel}</h1>
            <p className="text-[13px] text-gray-500">
              {d.video.kunde ? `${d.video.kunde} · ` : ''}Version {d.video.version}
            </p>
          </div>
          {st === 'freigegeben' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-[14px] font-semibold text-green-800">
              <CheckCircle2 className="h-4 w-4" /> Von dir freigegeben
            </span>
          ) : st === 'aenderungen' ? (
            <span className="rounded-full bg-orange-50 px-3 py-1.5 text-[14px] font-semibold text-orange-800">Änderungen gewünscht – wir sind dran</span>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => setEntscheidung('aenderungen')} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-[14px] font-medium">
                <PencilLine className="h-4 w-4" /> Änderungen gewünscht
              </button>
              <button type="button" onClick={() => setEntscheidung('freigegeben')} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-red-700 px-4 text-[14px] font-semibold text-white">
                <CheckCircle2 className="h-4 w-4" /> Freigeben
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <div className="rounded-2xl bg-white p-3 shadow-sm">
          {d.url ? (
            <video
              ref={player}
              src={d.url}
              controls
              playsInline
              className="max-h-[70vh] w-full rounded-xl bg-black"
              onTimeUpdate={(e) => setZeit(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDauer(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)}
            />
          ) : (
            <p className="p-6 text-gray-500">Video gerade nicht verfügbar – bitte Seite neu laden.</p>
          )}
          {laenge ? (
            <Zeitleiste
              laenge={laenge}
              zeit={zeit}
              marker={d.kommentare.filter((k) => k.zeit_s !== null).map((k) => ({ id: k.id, zeit_s: k.zeit_s!, zeit_bis_s: k.zeit_bis_s, farbe: k.erledigt ? 'bg-gray-300' : 'bg-orange-500', titel: k.text }))}
              bereich={mitZeit && von !== null ? { von, bis } : null}
              onSpringe={springe}
            />
          ) : null}
          <div className="mt-2 flex items-center justify-between text-[12.5px] text-gray-500">
            <span>
              {zeitText(zeit)} / {zeitText(laenge)}
            </span>
            <button type="button" onClick={() => setKuerzel((x) => !x)} className="hidden items-center gap-1 hover:text-gray-800 sm:inline-flex">
              <Keyboard className="h-3.5 w-3.5" /> Tastenkürzel
            </button>
          </div>
          {kuerzel && (
            <ul className="mt-2 grid gap-1 rounded-xl bg-gray-50 p-3 text-[13px] sm:grid-cols-2">
              {KUERZEL.map(([t, b]) => (
                <li key={t}>
                  <kbd className="rounded border border-gray-300 bg-white px-1.5 text-[12px]">{t}</kbd> <span className="text-gray-600">{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col rounded-2xl bg-white p-4 shadow-sm lg:max-h-[85vh]">
          <p className="text-[15px] font-semibold">Dein Feedback</p>
          <p className="mb-3 text-[13px] text-gray-500">Video anhalten, wo dir etwas auffällt, und kurz notieren – wir sehen genau die Stelle.</p>
          <input className="mb-2 h-10 w-full rounded-lg border border-gray-300 px-3 text-[14px]" placeholder="Dein Name" value={name} onChange={(e) => merkeName(e.target.value)} maxLength={60} />
          <div className="rounded-xl border border-gray-200 p-2.5">
            <textarea
              ref={feld}
              className="min-h-[70px] w-full resize-none text-[14px] outline-none"
              placeholder={mitZeit ? `Was sollen wir bei ${zeitLabel(von ?? zeit, bis)} ändern?` : 'Allgemeines Feedback …'}
              value={text}
              onFocus={() => {
                player.current?.pause();
                if (bis === null) setVon(player.current?.currentTime ?? zeit);
              }}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void kommentieren();
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-gray-600">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={mitZeit} onChange={(e) => setMitZeit(e.target.checked)} /> bei {zeitLabel(von ?? zeit, bis)}
                </label>
                {bis !== null && (
                  <button type="button" onClick={() => setBis(null)} className="inline-flex items-center gap-0.5 rounded px-1 hover:bg-gray-100">
                    <X className="h-3 w-3" /> Bereich
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={kommentieren}
                disabled={!text.trim() || !name.trim() || sendet}
                className="h-8 rounded-lg bg-red-700 px-3 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {sendet ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Senden'}
              </button>
            </div>
          </div>
          {!name.trim() && text.trim() && <p className="mt-1 text-[12.5px] text-orange-700">Bitte trag oben deinen Namen ein.</p>}
          {fehler && <p className="mt-2 text-[13px] text-red-700">{fehler}</p>}

          <ul className="mt-3 flex-1 space-y-2 overflow-y-auto">
            {d.kommentare.length === 0 && <li className="text-[13.5px] text-gray-500">Noch kein Feedback.</li>}
            {d.kommentare.map((k) => (
              <li key={k.id} className={`rounded-xl border p-2.5 ${k.erledigt ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => springe(k.zeit_s)} className="mt-0.5 flex-none rounded-md bg-orange-50 px-1.5 py-0.5 text-[12px] font-semibold text-orange-800">
                    {zeitLabel(k.zeit_s, k.zeit_bis_s)}
                  </button>
                  <p className={`flex-1 whitespace-pre-wrap text-[13.5px] ${k.erledigt ? 'line-through' : ''}`}>{k.text}</p>
                </div>
                <p className="mt-1 text-[12px] text-gray-500">
                  {k.kunde_name} · {new Date(k.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  {k.erledigt ? ' · umgesetzt ✓' : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </main>

      {entscheidung && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-[17px] font-semibold">{entscheidung === 'freigegeben' ? 'Video freigeben?' : 'Änderungen anfordern?'}</p>
            <p className="mt-1 text-[13.5px] text-gray-600">
              {entscheidung === 'freigegeben'
                ? `Damit gibst du Version ${d.video.version} frei. Wir bereiten alles für die Veröffentlichung vor.`
                : 'Wir setzen deine Kommentare um und schicken dir die neue Version über diesen Link.'}
            </p>
            {!name.trim() && <input className="mt-3 h-10 w-full rounded-lg border border-gray-300 px-3 text-[14px]" placeholder="Dein Name" value={name} onChange={(e) => merkeName(e.target.value)} />}
            <textarea
              className="mt-3 min-h-[70px] w-full rounded-lg border border-gray-300 p-2.5 text-[14px]"
              placeholder={entscheidung === 'freigegeben' ? 'Noch etwas für uns? (optional)' : 'Was sollen wir allgemein ändern? (optional)'}
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
            />
            {fehler && <p className="mt-2 text-[13px] text-red-700">{fehler}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setEntscheidung(null)} className="h-10 rounded-lg border border-gray-300 px-3 text-[14px]">
                Abbrechen
              </button>
              <button type="button" onClick={entscheiden} disabled={!name.trim() || sendet} className="h-10 rounded-lg bg-red-700 px-4 text-[14px] font-semibold text-white disabled:opacity-40">
                {entscheidung === 'freigegeben' ? 'Ja, freigeben' : 'Änderungen senden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
