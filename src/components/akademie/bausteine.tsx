'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckSquare, Square, ShieldCheck, Send } from 'lucide-react';

type ReviewStatus = 'selbstcheck' | 'zur_pruefung' | 'geprueft' | 'nacharbeit';

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  selbstcheck: 'Selbstcheck',
  zur_pruefung: 'Zur Prüfung bei der Führung',
  geprueft: 'Geprüft',
  nacharbeit: 'Nacharbeit nötig',
};

function Haken({ punkte, erledigt, onToggle, klein = false }: { punkte: string[]; erledigt: number[]; onToggle: (i: number) => void; klein?: boolean }) {
  const set = new Set(erledigt);
  return (
    <ul className="space-y-1">
      {punkte.map((p, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => onToggle(i)}
            className={`flex w-full items-start gap-2 rounded-[10px] px-2 py-1.5 text-left hover:bg-panel ${klein ? 'text-[13.5px]' : 'text-[15px]'} ${set.has(i) ? 'text-gray-500 line-through' : ''}`}
          >
            {set.has(i) ? <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <Square className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />}
            <span>{p}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const umschalten = (liste: number[], i: number) => (liste.includes(i) ? liste.filter((x) => x !== i) : [...liste, i].sort((a, b) => a - b));

/** Baustein 3: Checkliste zum Abarbeiten – gespeichert pro Nutzer und Vorgang */
export function ChecklisteBaustein({
  slug,
  punkte,
  kontext,
  start,
  klein = false,
  onKomplett,
}: {
  slug: string;
  punkte: string[];
  kontext: string;
  start?: number[];
  klein?: boolean;
  onKomplett?: (komplett: boolean) => void;
}) {
  const [erledigt, setErledigt] = useState<number[]>(start ?? []);
  const [geladen, setGeladen] = useState(!!start);

  useEffect(() => {
    if (start) return;
    let aktiv = true;
    fetch(`/api/akademie/checkliste?slug=${encodeURIComponent(slug)}&kontext=${encodeURIComponent(kontext)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!aktiv) return;
        setErledigt(d?.erledigt ?? []);
        setGeladen(true);
      });
    return () => {
      aktiv = false;
    };
  }, [slug, kontext, start]);

  useEffect(() => {
    onKomplett?.(punkte.length > 0 && erledigt.length === punkte.length);
  }, [erledigt, punkte.length, onKomplett]);

  const toggle = useCallback(
    (i: number) => {
      setErledigt((alt) => {
        const neu = umschalten(alt, i);
        void fetch('/api/akademie/checkliste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, kontext, erledigt: neu }) });
        return neu;
      });
    },
    [slug, kontext],
  );

  if (!punkte.length) return <p className="text-[14px] text-gray-500">Für dieses Thema gibt es keine Checkliste.</p>;
  return (
    <div className={geladen ? '' : 'opacity-60'}>
      <div className="mb-1 text-[12.5px] text-gray-500">{erledigt.length}/{punkte.length} erledigt</div>
      <Haken punkte={punkte} erledigt={erledigt} onToggle={toggle} klein={klein} />
      {erledigt.length > 0 && (
        <button type="button" onClick={() => { setErledigt([]); void fetch('/api/akademie/checkliste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, kontext, erledigt: [] }) }); }} className="mt-1 text-[12.5px] text-gray-500 hover:text-ink">
          Für neuen Vorgang zurücksetzen
        </button>
      )}
    </div>
  );
}

/** Baustein 4: Review-Checkliste – Selbstcheck, optional zur Prüfung an die Führung */
export function ReviewBaustein({ slug, punkte, kontext, klein = false }: { slug: string; punkte: string[]; kontext: string; klein?: boolean }) {
  const [erledigt, setErledigt] = useState<number[]>([]);
  const [status, setStatus] = useState<ReviewStatus | null>(null);
  const [notiz, setNotiz] = useState('');
  const [kommentar, setKommentar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let aktiv = true;
    fetch(`/api/akademie/review?slug=${encodeURIComponent(slug)}&kontext=${encodeURIComponent(kontext)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!aktiv || !d?.review) return;
        setErledigt(d.review.erledigt ?? []);
        setStatus(d.review.status);
        setNotiz(d.review.notiz ?? '');
        setKommentar(d.review.pruefer_kommentar ?? null);
      });
    return () => {
      aktiv = false;
    };
  }, [slug, kontext]);

  async function speichern(neu: number[], zurPruefung = false) {
    setBusy(true);
    const r = await fetch('/api/akademie/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, kontext, erledigt: neu, notiz, zurPruefung }) });
    const d = r.ok ? await r.json() : null;
    if (d?.review) setStatus(d.review.status);
    setBusy(false);
  }

  if (!punkte.length) return <p className="text-[14px] text-gray-500">Für dieses Thema gibt es keine Review-Checkliste.</p>;
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[12.5px] text-gray-500">
        <ShieldCheck className="h-3.5 w-3.5" /> {erledigt.length}/{punkte.length} geprüft{status ? ` · ${REVIEW_LABEL[status]}` : ''}
      </div>
      <Haken
        punkte={punkte}
        erledigt={erledigt}
        klein={klein}
        onToggle={(i) => {
          const neu = umschalten(erledigt, i);
          setErledigt(neu);
          void speichern(neu);
        }}
      />
      {kommentar && <p className="mt-2 rounded-[10px] bg-amber-50 px-3 py-2 text-[13.5px] text-amber-900">Kommentar der Führung: {kommentar}</p>}
      <textarea
        value={notiz}
        onChange={(e) => setNotiz(e.target.value)}
        onBlur={() => void speichern(erledigt)}
        placeholder="Notiz zum Review (optional): Was lief gut, was war unklar?"
        rows={2}
        className="mt-2 w-full rounded-[10px] border border-[var(--hair)] bg-transparent px-3 py-2 text-[14px]"
      />
      {status !== 'zur_pruefung' && status !== 'geprueft' && (
        <button type="button" disabled={busy} onClick={() => void speichern(erledigt, true)} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-1.5 text-[13.5px] font-medium text-gray-700 hover:text-red-800">
          <Send className="h-3.5 w-3.5" /> Zur Prüfung an die Führung
        </button>
      )}
    </div>
  );
}
