'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Building2, Check, ChevronDown, Clock, PauseCircle, User, Eye } from 'lucide-react';
import { PHASES, stepsForPhase, type Phase } from '@/lib/fulfillment/catalog';
import type { BoardClient } from '@/lib/fulfillment/views';

const STORAGE_KEY = 'fulfillment-board-offen';

function tage(n: number): string {
  if (n === 0) return 'seit heute';
  if (n === 1) return 'seit 1 Tag';
  return `seit ${n} Tagen`;
}

function frist(d: string | null): string | null {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : null;
}

/** Kundenkarte in der Spalte ihres aktuellen Schritts – mit Schnell-Aktion für genau diesen Schritt. */
function ClientCard({ c, onStep }: { c: BoardClient; onStep: (stepId: string, status: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const s = c.aktueller_schritt;
  const pruefen = s?.status === 'zur_pruefung';
  const beimKunden = s?.wer === 'kunde' && !pruefen;

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
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 space-y-2 hover:shadow-md transition-shadow">
      <Link href={`/clients/${c.id}/ablauf`} className="block group">
        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-red-600 leading-tight">{c.name}</p>
        <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
          <Clock className="w-3 h-3" /> Phase {tage(c.tage_in_phase)} · {c.schritte_erledigt}/{c.schritte_gesamt}
        </p>
      </Link>

      {c.pausiert_grund && (
        <p className="flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
          <PauseCircle className="w-3 h-3 flex-shrink-0" /> {c.pausiert_grund}
        </p>
      )}

      {s && (
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          {pruefen ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
              <Eye className="w-3 h-3" /> prüfen
            </span>
          ) : beimKunden ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
              <Building2 className="w-3 h-3" /> beim Kunden
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-medium">
              <User className="w-3 h-3" /> {s.owner_name ?? 'Team'}
            </span>
          )}
          {frist(s.faellig_am) && (
            <span className={s.ueberfaellig ? 'text-red-600 font-semibold inline-flex items-center gap-0.5' : 'text-gray-500'}>
              {s.ueberfaellig && <AlertTriangle className="w-3 h-3" />} bis {frist(s.faellig_am)}
            </span>
          )}
        </div>
      )}

      {s && (
        <button
          disabled={busy}
          onClick={() => act('erledigt')}
          className={`w-full h-7 rounded-md text-[11px] font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50 ${
            pruefen ? 'bg-green-600 text-white hover:bg-green-700' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Check className="w-3 h-3" /> {pruefen ? 'Passt – erledigt' : beimKunden ? 'Kunde hat erledigt' : 'Erledigt'}
        </button>
      )}
    </div>
  );
}

/** Ein Bereich (Phase) als aufklappbares Kanban: Spalten = Schritte, Karten = Kunden am jeweiligen Schritt. */
function PhaseKanban({
  phase,
  clients,
  offen,
  onToggle,
  onStep,
}: {
  phase: (typeof PHASES)[number];
  clients: BoardClient[];
  offen: boolean;
  onToggle: () => void;
  onStep: (stepId: string, status: string) => Promise<void>;
}) {
  const steps = stepsForPhase(phase.key);
  const ueberfaellig = clients.filter((c) => c.aktueller_schritt?.ueberfaellig).length;
  const ohneSchritt = clients.filter((c) => !c.aktueller_schritt);

  return (
    <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button onClick={onToggle} className={`w-full ${phase.farbe} px-4 py-3 text-white flex items-center gap-3 text-left`}>
        <ChevronDown className={`w-5 h-5 transition-transform ${offen ? '' : '-rotate-90'}`} />
        <span className="font-bold">{phase.label}</span>
        <span className="text-xs bg-white/25 rounded-full px-2 py-0.5 font-semibold">{clients.length} Kunden</span>
        {ueberfaellig > 0 && (
          <span className="text-xs bg-white text-red-600 rounded-full px-2 py-0.5 font-semibold inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {ueberfaellig} überfällig
          </span>
        )}
        <span className="ml-auto text-xs opacity-90 hidden sm:inline">{phase.beschreibung}</span>
      </button>

      {offen && (
        <div className="flex gap-3 overflow-x-auto p-3 bg-gray-50">
          {steps.map((step, i) => {
            const col = clients
              .filter((c) => c.aktueller_schritt?.step_key === step.key)
              .sort((a, b) => Number(b.aktueller_schritt?.ueberfaellig) - Number(a.aktueller_schritt?.ueberfaellig) || b.tage_in_phase - a.tage_in_phase);
            return (
              <div key={step.key} className="flex-shrink-0 w-56">
                <div className="flex items-start gap-1.5 mb-2 px-0.5 min-h-[34px]">
                  <span className="text-[10px] font-bold text-gray-400 mt-0.5">{i + 1}</span>
                  <span className="text-xs font-semibold text-gray-800 leading-tight flex-1">{step.titel}</span>
                  {step.wer === 'kunde' && <Building2 className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" aria-label="Kunde" />}
                  <span className="text-[11px] text-gray-400">{col.length || ''}</span>
                </div>
                <div className={`space-y-2 min-h-[64px] rounded-lg p-1.5 border border-dashed ${col.length ? 'border-gray-200' : 'border-gray-100'}`}>
                  {col.map((c) => (
                    <ClientCard key={c.id} c={c} onStep={onStep} />
                  ))}
                </div>
              </div>
            );
          })}
          {ohneSchritt.length > 0 && (
            <div className="flex-shrink-0 w-56">
              <div className="text-xs font-semibold text-gray-500 mb-2 px-0.5 min-h-[34px]">Alle Schritte erledigt</div>
              <div className="space-y-2">
                {ohneSchritt.map((c) => (
                  <ClientCard key={c.id} c={c} onStep={onStep} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function FulfillmentBoard({
  clients,
  onStep,
}: {
  clients: BoardClient[];
  onStep: (stepId: string, status: string) => Promise<void>;
}) {
  // Aufgeklappte Bereiche merken; Standard: alle Bereiche mit Kunden offen
  const [offen, setOffen] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    let saved: Record<string, boolean> | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
      saved = null;
    }
    const initial = saved ?? Object.fromEntries(PHASES.map((p) => [p.key, clients.some((c) => c.phase === p.key)]));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- einmalig aus localStorage
    setOffen(initial);
  }, [clients]);

  const toggle = (key: Phase) => {
    const next = { ...(offen ?? {}), [key]: !offen?.[key] };
    setOffen(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignorieren */
    }
  };

  return (
    <div className="space-y-4">
      {PHASES.map((p) => (
        <PhaseKanban
          key={p.key}
          phase={p}
          clients={clients.filter((c) => c.phase === p.key)}
          offen={!!offen?.[p.key]}
          onToggle={() => toggle(p.key)}
          onStep={onStep}
        />
      ))}
    </div>
  );
}
