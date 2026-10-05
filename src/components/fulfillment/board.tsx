'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AlertTriangle, Building2, Check, Clock, Eye, PauseCircle, Flag } from 'lucide-react';
import { PHASES, stepsForPhase, type Phase } from '@/lib/fulfillment/catalog';
import type { BoardClient } from '@/lib/fulfillment/views';
import { Avatar } from '@/components/ui/avatar';
import { SegmentedControl } from '@/components/ui/segmented-control';

const STORAGE_KEY = 'fulfillment-board-pipeline';

type Filter = 'alle' | 'team' | 'kunde' | 'pruefen' | 'ueberfaellig';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'alle', label: 'Alle' },
  { value: 'team', label: 'Bei uns' },
  { value: 'kunde', label: 'Beim Kunden' },
  { value: 'pruefen', label: 'Zu prüfen' },
  { value: 'ueberfaellig', label: 'Überfällig' },
];

function matches(c: BoardClient, f: Filter): boolean {
  const s = c.aktueller_schritt;
  switch (f) {
    case 'alle':
      return true;
    case 'team':
      return !!s && s.wer === 'zoepp' && s.status !== 'zur_pruefung';
    case 'kunde':
      return !!s && s.wer === 'kunde' && s.status !== 'zur_pruefung';
    case 'pruefen':
      return s?.status === 'zur_pruefung';
    case 'ueberfaellig':
      return !!s?.ueberfaellig;
  }
}

function tage(n: number): string {
  if (n === 0) return 'seit heute';
  if (n === 1) return 'seit 1 Tag';
  return `seit ${n} Tagen`;
}

function frist(d: string | null): string | null {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : null;
}

/* ── Gewählte Pipeline im Browser merken ─────────────────────────── */

const listeners = new Set<() => void>();
function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function savePipeline(p: Phase) {
  try {
    localStorage.setItem(STORAGE_KEY, p);
  } catch {
    /* ignorieren */
  }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/* ── Karte ───────────────────────────────────────────────────────── */

/** Kundenkarte am aktuellen Schritt – mit Schnell-Aktion für genau diesen Schritt. */
function ClientCard({ c, index, onStep }: { c: BoardClient; index: number; onStep: (stepId: string, status: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const s = c.aktueller_schritt;
  const pruefen = s?.status === 'zur_pruefung';
  const beimKunden = s?.wer === 'kunde' && !pruefen;
  const fortschritt = c.schritte_gesamt > 0 ? c.schritte_erledigt / c.schritte_gesamt : 0;

  const act = async (status: string) => {
    if (!s) return;
    setBusy(true);
    try {
      await onStep(s.id, status);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className="fx-rise fx-lift rounded-[18px] bg-card p-[18px] shadow-sm"
      style={{ '--d': `${80 + index * 50}ms` } as React.CSSProperties}
    >
      {/* Tags */}
      <div className="flex flex-wrap items-center gap-2">
        {pruefen ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
            <Eye className="h-3 w-3" /> Prüfen
          </span>
        ) : beimKunden ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            <Building2 className="h-3 w-3" /> Beim Kunden
          </span>
        ) : s ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800">
            {s.owner_name ?? 'Team'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
            <Check className="h-3 w-3" /> Fertig
          </span>
        )}
        {s?.ueberfaellig && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
            <Flag className="h-3 w-3" /> Überfällig
          </span>
        )}
      </div>

      {/* Titel */}
      <Link href={`/clients/${c.id}/ablauf`} className="mt-3 flex items-center gap-2.5 text-[17px] font-medium leading-snug tracking-[-0.015em] hover:text-red-800">
        <Avatar name={c.name} src={c.logo_url} size={30} />
        <span className="min-w-0">{c.name}</span>
      </Link>

      {c.pausiert_grund && (
        <p className="mt-2 flex items-start gap-1.5 rounded-[10px] bg-gray-100 px-2.5 py-1.5 text-xs text-gray-700">
          <PauseCircle className="mt-px h-3.5 w-3.5 flex-shrink-0" /> {c.pausiert_grund}
        </p>
      )}

      {/* Fortschritt in der Phase */}
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100" title={`${c.schritte_erledigt} von ${c.schritte_gesamt} Schritten`}>
        <div className="h-full origin-left rounded-full bg-red-700" style={{ width: `${Math.round(fortschritt * 100)}%`, animation: 'fx-bar .9s cubic-bezier(.33,1,.68,1) both' }} />
      </div>

      {/* Fuß */}
      <div className="mt-3.5 flex items-center gap-3 text-[13px] text-gray-600">
        {s && frist(s.faellig_am) ? (
          <span className={`inline-flex items-center gap-1 ${s.ueberfaellig ? 'font-semibold text-red-700' : ''}`}>
            {s.ueberfaellig ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />} bis {frist(s.faellig_am)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {tage(c.tage_in_phase)}
          </span>
        )}
        <span>
          {c.schritte_erledigt}/{c.schritte_gesamt}
        </span>
        <span className="ml-auto">
          <Avatar name={beimKunden ? (c.contact_name ?? c.name) : (s?.owner_name ?? c.name)} size={34} />
        </span>
      </div>

      {s && (
        <button
          disabled={busy}
          onClick={() => act('erledigt')}
          className={`mt-3.5 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition-colors disabled:opacity-50 ${
            pruefen
              ? 'bg-gradient-to-b from-red-700 to-red-950 text-red-50 hover:from-red-600 hover:to-red-800'
              : 'text-ink shadow-[inset_0_0_0_1.5px_var(--hair)] hover:bg-panel'
          }`}
        >
          <Check className="h-3.5 w-3.5" /> {pruefen ? 'Passt – erledigt' : beimKunden ? 'Kunde hat erledigt' : 'Erledigt'}
        </button>
      )}
    </article>
  );
}

/* ── Spalte ──────────────────────────────────────────────────────── */

function Column({
  nr,
  titel,
  dot,
  kunde,
  clients,
  onStep,
}: {
  nr?: number;
  titel: string;
  dot: string;
  kunde?: boolean;
  clients: BoardClient[];
  onStep: (stepId: string, status: string) => Promise<void>;
}) {
  return (
    <section className="flex w-full flex-shrink-0 flex-col rounded-xl p-3 shadow-[inset_0_0_0_1.5px_var(--hair)] md:w-[300px]">
      <header className="flex items-center gap-2.5 px-1.5 pb-3 pt-1.5">
        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: dot }} />
        <h3 className="min-w-0 flex-1 text-[15px] font-medium leading-tight">
          {nr !== undefined && <span className="mr-1 text-gray-500">{nr}.</span>}
          {titel}
        </h3>
        {kunde && <Building2 className="h-4 w-4 flex-shrink-0 text-amber-600" aria-label="Kunde ist dran" />}
        <span className="min-w-[28px] rounded-full bg-card px-2 py-0.5 text-center text-[12.5px] font-semibold shadow-[inset_0_0_0_1px_var(--hair)]">
          {clients.length}
        </span>
      </header>
      <div className="space-y-3">
        {clients.map((c, i) => (
          <ClientCard key={c.id} c={c} index={i} onStep={onStep} />
        ))}
      </div>
    </section>
  );
}

/** Leerer Schritt: schmaler Streifen, damit die Reihenfolge sichtbar bleibt ohne Platz zu fressen */
function EmptyStep({ nr, titel, kunde }: { nr: number; titel: string; kunde: boolean }) {
  return (
    <div
      title={`${nr}. ${titel} – kein Kunde`}
      className="hidden w-11 flex-shrink-0 flex-col items-center gap-3 rounded-xl py-4 text-gray-500 shadow-[inset_0_0_0_1.5px_var(--hair)] md:flex"
    >
      <span className="text-xs font-semibold">{nr}</span>
      <span className={`h-2 w-2 rounded-full ${kunde ? 'bg-amber-400' : 'bg-gray-300'}`} />
      <span className="max-h-[220px] overflow-hidden text-ellipsis whitespace-nowrap text-[13px] [writing-mode:vertical-rl]">{titel}</span>
    </div>
  );
}

/* ── Board ───────────────────────────────────────────────────────── */

export function FulfillmentBoard({
  clients,
  onStep,
}: {
  clients: BoardClient[];
  onStep: (stepId: string, status: string) => Promise<void>;
}) {
  const saved = useSyncExternalStore(subscribe, readSaved, () => null);
  const firstWithClients = PHASES.find((p) => clients.some((c) => c.phase === p.key))?.key ?? PHASES[0].key;
  const pipeline = (PHASES.some((p) => p.key === saved) ? saved : firstWithClients) as Phase;
  const [filter, setFilter] = useState<Filter>('alle');
  const [alleSchritte, setAlleSchritte] = useState(false);

  const phase = PHASES.find((p) => p.key === pipeline)!;
  const inPhase = useMemo(() => clients.filter((c) => c.phase === pipeline), [clients, pipeline]);
  const shown = inPhase.filter((c) => matches(c, filter));
  const steps = stepsForPhase(pipeline);
  const stepKeys = new Set(steps.map((st) => st.key));
  const ohneSchritt = shown.filter((c) => !c.aktueller_schritt);
  // Sicherheitsnetz: aktueller Schritt gehört nicht zu dieser Pipeline → eigene Spalte statt unsichtbar
  const fremd = shown.filter((c) => c.aktueller_schritt && !stepKeys.has(c.aktueller_schritt.step_key));

  const sortCol = (a: BoardClient, b: BoardClient) =>
    Number(b.aktueller_schritt?.ueberfaellig) - Number(a.aktueller_schritt?.ueberfaellig) || b.tage_in_phase - a.tage_in_phase;

  return (
    <div>
      {/* Pipeline-Auswahl */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div role="tablist" aria-label="Pipeline" className="inline-flex gap-2">
          {PHASES.map((p) => {
            const n = clients.filter((c) => c.phase === p.key).length;
            const late = clients.filter((c) => c.phase === p.key && c.aktueller_schritt?.ueberfaellig).length;
            const active = p.key === pipeline;
            return (
              <button
                key={p.key}
                role="tab"
                aria-selected={active}
                onClick={() => savePipeline(p.key)}
                className={`inline-flex h-11 flex-shrink-0 items-center gap-2.5 rounded-full px-[18px] text-[15px] font-medium transition-[background,color,box-shadow] duration-300 ${
                  active
                    ? 'bg-gradient-to-b from-red-700 to-red-950 text-red-50 shadow-hero'
                    : 'bg-card text-gray-600 hover:text-ink'
                }`}
              >
                {p.label}
                <span
                  className={`min-w-[24px] rounded-full px-1.5 text-center text-xs font-semibold leading-5 ${
                    active ? 'bg-white/20 text-white' : 'bg-gray-100 text-ink'
                  }`}
                >
                  {n}
                </span>
                {late > 0 && <span className={`h-2 w-2 rounded-full ${active ? 'bg-red-200' : 'bg-red-600'}`} title={`${late} überfällig`} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Werkzeugleiste */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <SegmentedControl items={FILTERS} value={filter} onChange={(v) => setFilter(v as Filter)} />
        <div className="flex items-center gap-4 text-[14px] text-gray-600">
          <label className="hidden cursor-pointer items-center gap-2 md:inline-flex">
            <input
              type="checkbox"
              checked={alleSchritte}
              onChange={(e) => setAlleSchritte(e.target.checked)}
              className="h-4 w-4 accent-red-800"
            />
            Leere Schritte als Spalte
          </label>
          <span>
            <strong className="font-semibold text-ink">{shown.length}</strong> {shown.length === 1 ? 'Kunde' : 'Kunden'}
          </span>
        </div>
      </div>
      <p className="mt-3 text-[13.5px] text-gray-600">{phase.beschreibung}</p>

      {/* Board der gewählten Pipeline */}
      <div key={`${pipeline}-${filter}`} className="-mx-1 mt-4 flex flex-col gap-3 px-1 pb-3 md:flex-row md:items-start md:overflow-x-auto">
        {steps.map((step, i) => {
          const col = shown.filter((c) => c.aktueller_schritt?.step_key === step.key).sort(sortCol);
          if (col.length === 0 && !alleSchritte) {
            return <EmptyStep key={step.key} nr={i + 1} titel={step.titel} kunde={step.wer === 'kunde'} />;
          }
          return (
            <Column
              key={step.key}
              nr={i + 1}
              titel={step.titel}
              dot={step.wer === 'kunde' ? '#e8a317' : '#a3201a'}
              kunde={step.wer === 'kunde'}
              clients={col}
              onStep={onStep}
            />
          );
        })}
        {fremd.length > 0 && <Column titel="Anderer Schritt" dot="#a69f9b" clients={fremd} onStep={onStep} />}
        {(ohneSchritt.length > 0 || alleSchritte) && (
          <Column titel="Alle Schritte erledigt" dot="#2fb36b" clients={ohneSchritt} onStep={onStep} />
        )}
        {shown.length === 0 && (
          <p className="self-center px-4 text-sm text-gray-500">
            {inPhase.length === 0 ? 'Gerade kein Kunde in dieser Pipeline.' : 'Kein Kunde passt zu diesem Filter.'}
          </p>
        )}
      </div>
    </div>
  );
}
