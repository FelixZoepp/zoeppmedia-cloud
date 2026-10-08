'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SopLink } from '@/components/akademie/sop-link';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Clock, Flag, MoreHorizontal, Plus, Receipt } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Avatar } from '@/components/ui/avatar';
import { buttonStyles } from '@/components/ui/button';
import type { StepView } from '@/lib/fulfillment/views';
import { PHASES } from '@/lib/fulfillment/catalog';
import { today } from '@/lib/fulfillment/views-client';

/* ── Datentypen aus /api/meine-todos ───────────────────────────── */

interface MeineAd {
  id: string;
  agency_name: string;
  titel: string;
  typ: string;
  stage: string;
  faellig_am: string | null;
  kunden_kommentar: string | null;
}

interface WeitereAufgabe {
  quelle: 'projekt' | 'intern';
  id: string;
  titel: string;
  status: string;
  faellig_am: string | null;
  agency_name: string | null;
  link: string;
  zugewiesen: boolean;
}

interface Erledigt {
  quelle: Quelle;
  id: string;
  titel: string;
  agency_name: string | null;
  am: string | null;
  link: string | null;
}

/* ── Einheitliche Karte ────────────────────────────────────────── */

type Quelle = 'schritt' | 'ad' | 'projekt' | 'intern';
type Spalte = 'todo' | 'arbeit' | 'pruefen' | 'erledigt';

interface Task {
  key: string;
  quelle: Quelle;
  id: string;
  titel: string;
  kunde: string | null;
  faellig: string | null;
  spalte: Spalte;
  hinweis: string | null;
  link: string | null;
  ueberfaellig: boolean;
  blockiert: boolean;
  /** nur Ads: aktuelle Stage */
  stage?: string;
  /** nur Kunden-Schritte: Schlüssel im Ablauf (für „SOP ansehen“) */
  stepKey?: string;
}

const SPALTEN: { key: Spalte; label: string; dot: string; leer: string }[] = [
  { key: 'todo', label: 'Zu erledigen', dot: '#a69f9b', leer: 'Nichts offen' },
  { key: 'arbeit', label: 'In Arbeit', dot: '#e8a317', leer: 'Nichts angefangen' },
  { key: 'pruefen', label: 'Zu prüfen', dot: '#2f66c9', leer: 'Nichts zu prüfen' },
  { key: 'erledigt', label: 'Erledigt', dot: '#2fb36b', leer: 'Diese Woche noch nichts' },
];

const PHASE_LABEL: Record<string, string> = Object.fromEntries(PHASES.map((p) => [p.key, p.label]));

const QUELLE: Record<Quelle, { label: string; chip: string }> = {
  schritt: { label: 'Fulfillment', chip: 'bg-amber-50 text-amber-800' },
  ad: { label: 'Ad', chip: 'bg-violet-50 text-violet-700' },
  projekt: { label: 'Projekt', chip: 'bg-sky-50 text-sky-800' },
  intern: { label: 'Intern', chip: 'bg-gray-100 text-gray-700' },
};

/** Zielstatus je Quelle, wenn eine Karte in eine Spalte gezogen wird (null = nicht möglich) */
const ZIEL: Record<Quelle, Record<Spalte, string | null>> = {
  schritt: { todo: 'offen', arbeit: 'in_arbeit', pruefen: 'zur_pruefung', erledigt: 'erledigt' },
  projekt: { todo: 'offen', arbeit: 'in_arbeit', pruefen: 'zur_freigabe', erledigt: 'erledigt' },
  intern: { todo: 'todo', arbeit: 'in_progress', pruefen: 'review', erledigt: 'done' },
  // Freigabe macht der Kunde – „Erledigt“ heißt: an den Kunden schicken bzw. nach Freigabe live schalten
  ad: { todo: null, arbeit: 'bearbeitung', pruefen: null, erledigt: 'live' },
};

/** Zielstatus für eine konkrete Karte (Ads: vor der Freigabe geht „Erledigt“ an den Kunden statt live) */
function zielFür(t: Task, spalte: Spalte): string | null {
  if (t.quelle === 'ad' && spalte === 'erledigt' && t.stage !== 'bereit') return 'freigabe_kunde';
  return ZIEL[t.quelle][spalte];
}

function endpoint(t: Task, ziel: string): { url: string; body: Record<string, string> } {
  switch (t.quelle) {
    case 'schritt':
      return { url: `/api/fulfillment/steps/${t.id}`, body: { status: ziel } };
    case 'projekt':
      return { url: `/api/project-tasks/${t.id}`, body: { status: ziel } };
    case 'intern':
      return { url: `/api/tasks/${t.id}`, body: { status: ziel } };
    case 'ad':
      return { url: `/api/ads/${t.id}`, body: { stage: ziel } };
  }
}

const AD_HINWEIS: Record<string, string> = {
  idee: 'Idee',
  material: 'Material sammeln',
  bearbeitung: 'In Bearbeitung',
  bereit: 'Freigegeben – live schalten',
};

function toTasks(steps: StepView[], ads: MeineAd[], weitere: WeitereAufgabe[], erledigt: Erledigt[], heute: string): Task[] {
  const late = (d: string | null) => !!d && d.slice(0, 10) < heute;
  return [
    ...steps.map<Task>((s) => ({
      key: `schritt-${s.id}`,
      quelle: 'schritt',
      id: s.id,
      titel: s.titel,
      kunde: s.agency_name ?? null,
      faellig: s.faellig_am,
      spalte: s.status === 'zur_pruefung' ? 'pruefen' : s.status === 'in_arbeit' ? 'arbeit' : 'todo',
      hinweis: s.status === 'zur_pruefung' ? 'Vom Kunden erledigt – bitte prüfen' : null,
      link: `/clients/${s.agency_id}/ablauf`,
      ueberfaellig: s.ueberfaellig,
      blockiert: false,
      stepKey: s.step_key,
    })),
    ...ads.map<Task>((a) => ({
      key: `ad-${a.id}`,
      quelle: 'ad',
      id: a.id,
      titel: a.titel,
      kunde: a.agency_name,
      faellig: a.faellig_am,
      spalte: a.stage === 'bereit' ? 'pruefen' : a.stage === 'bearbeitung' ? 'arbeit' : 'todo',
      hinweis: a.stage === 'bearbeitung' && a.kunden_kommentar ? `Änderungswunsch: ${a.kunden_kommentar}` : AD_HINWEIS[a.stage] ?? null,
      link: '/ads',
      ueberfaellig: late(a.faellig_am),
      blockiert: false,
      stage: a.stage,
    })),
    ...weitere.map<Task>((w) => ({
      key: `${w.quelle}-${w.id}`,
      quelle: w.quelle,
      id: w.id,
      titel: w.titel,
      kunde: w.agency_name,
      faellig: w.faellig_am,
      spalte:
        w.status === 'in_arbeit' || w.status === 'in_progress'
          ? 'arbeit'
          : w.status === 'zur_freigabe' || w.status === 'review'
            ? 'pruefen'
            : 'todo',
      hinweis: !w.zugewiesen ? 'Ohne Zuständigen' : null,
      link: w.link,
      ueberfaellig: late(w.faellig_am),
      blockiert: w.status === 'blockiert',
    })),
    ...erledigt.map<Task>((e) => ({
      key: `done-${e.quelle}-${e.id}`,
      quelle: e.quelle,
      id: e.id,
      titel: e.titel,
      kunde: e.agency_name,
      faellig: e.am ? e.am.slice(0, 10) : null,
      spalte: 'erledigt',
      hinweis: null,
      link: e.link,
      ueberfaellig: false,
      blockiert: false,
    })),
  ];
}

function fristText(t: Task, heute: string): string | null {
  if (!t.faellig) return null;
  const d = t.faellig.slice(0, 10);
  if (t.spalte === 'erledigt') return new Date(`${d}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const diff = Math.round((new Date(`${d}T12:00:00`).getTime() - new Date(`${heute}T12:00:00`).getTime()) / 864e5);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff > 1) return `In ${diff} Tagen`;
  return diff === -1 ? 'Seit gestern' : `Seit ${-diff} Tagen`;
}

/* ── Seite ─────────────────────────────────────────────────────── */

type Filter = 'alle' | 'ueberfaellig' | 'woche' | 'schritt' | 'ad' | 'weitere';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'alle', label: 'Alle' },
  { value: 'ueberfaellig', label: 'Überfällig' },
  { value: 'woche', label: 'Diese Woche' },
  { value: 'schritt', label: 'Kunden-Schritte' },
  { value: 'ad', label: 'Ads' },
  { value: 'weitere', label: 'Weitere' },
];

export default function MeineTodosPage() {
  const [steps, setSteps] = useState<StepView[] | null>(null);
  const [ads, setAds] = useState<MeineAd[]>([]);
  const [weitere, setWeitere] = useState<WeitereAufgabe[]>([]);
  const [erledigt, setErledigt] = useState<Erledigt[]>([]);
  const [buchhaltung, setBuchhaltung] = useState<{ rechnungen: number; mahnanrufe: number } | null>(null);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('alle');
  // Optimistisch verschobene Karten, bis die Daten neu geladen sind
  const [moved, setMoved] = useState<Record<string, Spalte>>({});
  const heute = today();

  const apply = (d: { logos?: Record<string, string>; schritte?: StepView[]; ads?: MeineAd[]; weitere?: WeitereAufgabe[]; erledigt?: Erledigt[]; buchhaltung?: { rechnungen: number; mahnanrufe: number } | null }) => {
    setSteps(d.schritte ?? []);
    setAds(d.ads ?? []);
    setBuchhaltung(d.buchhaltung ?? null);
    setWeitere(d.weitere ?? []);
    setErledigt(d.erledigt ?? []);
    setLogos(d.logos ?? {});
    setMoved({});
  };
  const load = () =>
    fetch('/api/meine-todos')
      .then((r) => (r.ok ? r.json() : { schritte: [] }))
      .then(apply);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/meine-todos')
      .then((r) => (r.ok ? r.json() : { schritte: [] }))
      .then((d) => {
        if (!cancelled) apply(d);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tasks = useMemo(
    () => toTasks(steps ?? [], ads, weitere, erledigt, heute).map((t) => (moved[t.key] ? { ...t, spalte: moved[t.key] } : t)),
    [steps, ads, weitere, erledigt, heute, moved],
  );

  const wochenEnde = (() => {
    const d = new Date(`${heute}T12:00:00`);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return d.toISOString().slice(0, 10);
  })();
  const shown = tasks.filter((t) => {
    switch (filter) {
      case 'alle':
        return true;
      case 'ueberfaellig':
        return t.ueberfaellig;
      case 'woche':
        return t.spalte !== 'erledigt' && !!t.faellig && t.faellig.slice(0, 10) <= wochenEnde;
      case 'schritt':
        return t.quelle === 'schritt';
      case 'ad':
        return t.quelle === 'ad';
      case 'weitere':
        return t.quelle === 'projekt' || t.quelle === 'intern';
    }
  });

  const move = async (t: Task, spalte: Spalte, override?: string) => {
    if (t.spalte === spalte && !override) return;
    const ziel = override ?? zielFür(t, spalte);
    if (!ziel) {
      toast.error(t.quelle === 'ad' ? 'Ads gibt der Kunde frei – hier nur „In Arbeit“ oder „Erledigt“.' : 'Dorthin nicht möglich');
      return;
    }
    setMoved((m) => ({ ...m, [t.key]: spalte }));
    const { url, body } = endpoint(t, ziel);
    const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      // Projekt-Aufgabe mit Freigabe-Pflicht: „Erledigt“ heißt dann „zur Freigabe“
      if (err.code === 'freigabe_noetig' && t.quelle === 'projekt') {
        setMoved((m) => {
          const n = { ...m };
          delete n[t.key];
          return n;
        });
        return move(t, 'pruefen');
      }
      toast.error(err.error ?? 'Konnte nicht verschoben werden – bitte in der Aufgabe selbst ändern', {
        action: t.link ? { label: 'Öffnen', onClick: () => (window.location.href = t.link!) } : undefined,
      });
      setMoved((m) => {
        const n = { ...m };
        delete n[t.key];
        return n;
      });
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { advancedTo?: string | null };
    if (ziel === 'freigabe_kunde') toast.success('An den Kunden zur Freigabe geschickt');
    else if (ziel === 'nicht_noetig') toast.success('Als „nicht nötig“ markiert');
    else if (spalte === 'erledigt') toast.success(data.advancedTo ? `Erledigt – Kunde ist jetzt in der Phase „${PHASE_LABEL[data.advancedTo] ?? data.advancedTo}“` : 'Erledigt');
    await load();
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const t = tasks.find((x) => x.key === e.active.id);
    const ziel = e.over?.id as Spalte | undefined;
    if (t && ziel) void move(t, ziel);
  };

  if (!steps) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
      </div>
    );
  }

  const offen = tasks.filter((t) => t.spalte !== 'erledigt').length;

  return (
    <div>
      <PageHeader
        title="Meine Aufgaben"
        description="Mit ✓ direkt abhaken – oder Karte in eine andere Spalte ziehen."
        action={
          <Link href="/tasks" className={buttonStyles('primary', 'lg')}>
            <Plus /> Interne Aufgabe
          </Link>
        }
      />

      {buchhaltung && (buchhaltung.rechnungen > 0 || buchhaltung.mahnanrufe > 0) && (
        <Link href="/buchhaltung" className="mb-5 block">
          <Card hero className="fx-lift flex items-center gap-4">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-red-50 text-red-950">
              <Receipt className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[18px] font-semibold tracking-[-0.02em]">Buchhaltung</span>
              <span className="block text-[13.5px] text-red-200">
                {buchhaltung.rechnungen > 0 && <>{buchhaltung.rechnungen} Rechnung{buchhaltung.rechnungen === 1 ? '' : 'en'} schreiben</>}
                {buchhaltung.rechnungen > 0 && buchhaltung.mahnanrufe > 0 && ' · '}
                {buchhaltung.mahnanrufe > 0 && <>{buchhaltung.mahnanrufe} Mahnanruf{buchhaltung.mahnanrufe === 1 ? '' : 'e'}</>}
              </span>
            </span>
          </Card>
        </Link>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl items={FILTERS} value={filter} onChange={(v) => setFilter(v as Filter)} />
        <span className="text-[14px] text-gray-600">
          <strong className="font-semibold text-ink">{offen}</strong> offen
        </span>
      </div>

      {offen === 0 && filter === 'alle' && (
        <Card padding="lg" className="mb-5 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
          <p className="font-medium text-gray-700">Alles erledigt. Nichts liegt gerade bei dir.</p>
        </Card>
      )}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div key={filter} className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
          {SPALTEN.map((sp) => (
            <Column key={sp.key} spalte={sp} tasks={shown.filter((t) => t.spalte === sp.key)} heute={heute} logos={logos} onMove={move} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

/* ── Spalte + Karte ────────────────────────────────────────────── */

function Column({
  spalte,
  tasks,
  heute,
  logos,
  onMove,
}: {
  spalte: (typeof SPALTEN)[number];
  tasks: Task[];
  heute: string;
  logos: Record<string, string>;
  onMove: (t: Task, s: Spalte, override?: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: spalte.key });
  const sorted = [...tasks].sort(
    (a, b) =>
      spalte.key === 'erledigt'
        ? String(b.faellig).localeCompare(String(a.faellig))
        : Number(b.ueberfaellig) - Number(a.ueberfaellig) || String(a.faellig ?? '9999').localeCompare(String(b.faellig ?? '9999')),
  );
  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-[160px] flex-col rounded-xl p-3 transition-[box-shadow,background] ${
        isOver ? 'bg-red-50/60 shadow-[inset_0_0_0_2px_var(--r-700)]' : 'shadow-[inset_0_0_0_1.5px_var(--hair)]'
      }`}
    >
      <header className="flex items-center gap-2.5 px-1.5 pb-3 pt-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: spalte.dot }} />
        <h2 className="flex-1 text-[16px] font-medium">{spalte.label}</h2>
        <span className="min-w-[28px] rounded-full bg-card px-2 py-0.5 text-center text-[12.5px] font-semibold shadow-[inset_0_0_0_1px_var(--hair)]">
          {tasks.length}
        </span>
      </header>
      <div className="space-y-3">
        {sorted.map((t, i) => (
          <TaskCard key={t.key} t={t} index={i} heute={heute} logo={t.kunde ? logos[t.kunde] ?? null : null} onMove={onMove} />
        ))}
        {tasks.length === 0 && (
          <p className="rounded-[14px] px-3 py-6 text-center text-[13px] text-gray-500 shadow-[inset_0_0_0_1.5px_var(--hair)]">{spalte.leer}</p>
        )}
      </div>
    </section>
  );
}

function TaskCard({ t, index, heute, logo, onMove }: { t: Task; index: number; heute: string; logo: string | null; onMove: (t: Task, s: Spalte, override?: string) => void }) {
  const done = t.spalte === 'erledigt';
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: t.key, disabled: done });
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const frist = fristText(t, heute);
  const ziele = SPALTEN.filter((s) => s.key !== t.spalte && ZIEL[t.quelle][s.key]);

  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`fx-rise relative rounded-[18px] bg-card p-[18px] shadow-sm ${done ? '' : 'cursor-grab active:cursor-grabbing'} ${
        isDragging ? 'z-20 shadow-[0_24px_50px_-20px_#1a151480]' : ''
      }`}
      style={{
        '--d': `${60 + index * 45}ms`,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(1.5deg)` : undefined,
      } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${QUELLE[t.quelle].chip}`}>{QUELLE[t.quelle].label}</span>
        {t.ueberfaellig && !done && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
            <Flag className="h-3 w-3" /> Überfällig
          </span>
        )}
        {t.blockiert && <span className="text-xs font-medium text-gray-600">Blockiert</span>}
        {!done && zielFür(t, 'erledigt') && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onMove(t, 'erledigt')}
            title={t.quelle === 'ad' && t.stage !== 'bereit' ? 'An den Kunden zur Freigabe schicken' : 'Erledigt'}
            aria-label={t.quelle === 'ad' && t.stage !== 'bereit' ? 'An den Kunden zur Freigabe schicken' : 'Als erledigt markieren'}
            className="ml-auto grid h-8 w-8 place-items-center rounded-full text-gray-500 shadow-[inset_0_0_0_1.5px_var(--hair)] transition-colors hover:bg-green-50 hover:text-green-700 hover:shadow-[inset_0_0_0_1.5px_#16a34a]"
          >
            <CheckCircle2 className="h-[18px] w-[18px]" />
          </button>
        )}
        {!done && ziele.length > 0 && (
          <div ref={menuRef} className={`relative ${zielFür(t, 'erledigt') ? '' : 'ml-auto'}`}>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setMenu((m) => !m)}
              aria-label="Verschieben"
              className="grid h-8 w-8 place-items-center rounded-full text-gray-600 hover:bg-panel"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menu && (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                className="fx-dlg absolute right-0 top-9 z-30 w-48 overflow-hidden rounded-[14px] bg-card py-1.5 shadow-[0_0_0_1px_var(--hair),0_18px_40px_-16px_#1a151459]"
              >
                <p className="px-3.5 pb-1 pt-1 text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Verschieben nach</p>
                {ziele.map((z) => (
                  <button
                    key={z.key}
                    onClick={() => {
                      setMenu(false);
                      onMove(t, z.key);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[14px] hover:bg-panel"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: z.dot }} /> {z.label}
                  </button>
                ))}
                {t.quelle === 'schritt' && (
                  <button
                    onClick={() => {
                      setMenu(false);
                      if (confirm(`„${t.titel}“ wirklich als nicht nötig markieren?`)) onMove(t, 'erledigt', 'nicht_noetig');
                    }}
                    className="flex w-full items-center gap-2.5 border-t border-hair px-3.5 py-2 text-left text-[14px] text-gray-600 hover:bg-panel"
                  >
                    <span className="h-2 w-2 rounded-full bg-gray-300" /> Nicht nötig
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {t.link ? (
        <Link
          href={t.link}
          onPointerDown={(e) => e.stopPropagation()}
          className={`mt-3 block text-[16.5px] font-medium leading-snug tracking-[-0.015em] hover:text-red-800 ${done ? 'text-gray-500 line-through decoration-gray-400' : ''}`}
        >
          {t.titel}
        </Link>
      ) : (
        <p className={`mt-3 text-[16.5px] font-medium leading-snug ${done ? 'text-gray-500 line-through' : ''}`}>{t.titel}</p>
      )}
      {t.hinweis && !done && <p className="mt-1.5 text-[13px] leading-snug text-gray-600">{t.hinweis}</p>}
      {t.stepKey && !done && <SopLink stepKey={t.stepKey} className="mt-1.5" />}

      <div className="mt-3.5 flex items-center gap-3 text-[13px] text-gray-600">
        {frist && (
          <span className={`inline-flex flex-none items-center gap-1 whitespace-nowrap ${t.ueberfaellig && !done ? 'font-semibold text-red-700' : ''}`}>
            {t.ueberfaellig && !done ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
            {frist}
          </span>
        )}
        {t.kunde && <span className="min-w-0 truncate">{t.kunde}</span>}
        {t.kunde && (
          <span className="ml-auto">
            <Avatar name={t.kunde} src={logo} size={32} />
          </span>
        )}
      </div>
    </article>
  );
}
