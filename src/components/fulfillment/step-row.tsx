'use client';

import { useState } from 'react';
import { Check, RotateCcw, Ban, Play, Building2, AlertTriangle, MessageSquare } from 'lucide-react';
import type { StepView } from '@/lib/fulfillment/views';

export const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  offen: { label: 'Offen', cls: 'bg-gray-100 text-gray-600' },
  in_arbeit: { label: 'In Arbeit', cls: 'bg-sky-50 text-sky-700' },
  zur_pruefung: { label: 'Zur Prüfung', cls: 'bg-amber-50 text-amber-700' },
  erledigt: { label: 'Erledigt', cls: 'bg-green-50 text-green-700' },
  nicht_noetig: { label: 'Nicht nötig', cls: 'bg-gray-50 text-gray-400' },
};

export function formatDatum(d: string | null): string {
  if (!d) return '–';
  return new Date(`${d}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

/**
 * Ein Schritt mit Aktionen für das Team.
 * onChange(patch) → PATCH /api/fulfillment/steps/[id]
 */
export function StepRow({
  step,
  team,
  showAgency = false,
  onChange,
}: {
  step: StepView;
  team?: Array<{ id: string; name: string }>;
  showAgency?: boolean;
  onChange: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const done = step.status === 'erledigt' || step.status === 'nicht_noetig';
  const st = STATUS_LABEL[step.status];

  const act = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await onChange(patch);
    } finally {
      setBusy(false);
    }
  };

  const zurueck = () => {
    const kommentar = window.prompt('Was fehlt noch? (geht als Hinweis an den Kunden)');
    if (kommentar === null) return;
    void act({ status: 'offen', kommentar: kommentar || 'Bitte noch einmal prüfen.' });
  };

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-2.5 ${done ? 'opacity-60' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {showAgency && step.agency_name && (
            <span className="text-xs font-semibold text-red-600">{step.agency_name}</span>
          )}
          <span className={`text-sm ${done ? 'line-through text-gray-500' : 'text-gray-900 font-medium'}`}>{step.titel}</span>
          {step.wer === 'kunde' && (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
              <Building2 className="w-3 h-3" /> Kunde
            </span>
          )}
          <span className={`text-[11px] px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>
          {step.ueberfaellig && (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-700">
              <AlertTriangle className="w-3 h-3" /> überfällig
            </span>
          )}
        </div>
        {step.beschreibung && !done && <p className="text-xs text-gray-500 mt-0.5">{step.beschreibung}</p>}
        {step.kommentar && (
          <p className="text-xs text-gray-600 mt-1 flex items-start gap-1">
            <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" /> {step.kommentar}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        {team ? (
          <select
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700"
            value={step.owner_user_id ?? ''}
            disabled={busy}
            onChange={(e) => act({ owner_user_id: e.target.value || null })}
          >
            <option value="">– niemand –</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        ) : (
          <span className="text-gray-500">{step.owner_name ?? '–'}</span>
        )}

        <input
          type="date"
          className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700"
          value={step.faellig_am ?? ''}
          disabled={busy}
          onChange={(e) => act({ faellig_am: e.target.value || null })}
          title="Frist"
        />

        {!done && step.status === 'zur_pruefung' && (
          <>
            <button disabled={busy} onClick={() => act({ status: 'erledigt' })}
              className="h-8 px-2.5 rounded-md bg-green-600 text-white font-semibold inline-flex items-center gap-1 hover:bg-green-700">
              <Check className="w-3.5 h-3.5" /> Passt
            </button>
            <button disabled={busy} onClick={zurueck}
              className="h-8 px-2.5 rounded-md border border-gray-300 bg-white inline-flex items-center gap-1 hover:bg-gray-50">
              <RotateCcw className="w-3.5 h-3.5" /> Zurück an Kunden
            </button>
          </>
        )}
        {!done && step.status !== 'zur_pruefung' && (
          <>
            {step.status === 'offen' && step.wer === 'zoepp' && (
              <button disabled={busy} onClick={() => act({ status: 'in_arbeit' })}
                className="h-8 px-2.5 rounded-md border border-gray-300 bg-white inline-flex items-center gap-1 hover:bg-gray-50">
                <Play className="w-3.5 h-3.5" /> Starten
              </button>
            )}
            <button disabled={busy} onClick={() => act({ status: 'erledigt' })}
              className="h-8 px-2.5 rounded-full bg-gradient-to-b from-red-700 to-red-950 text-white font-semibold inline-flex items-center gap-1 hover:from-red-600 hover:to-red-800">
              <Check className="w-3.5 h-3.5" /> Erledigt
            </button>
            <button disabled={busy} onClick={() => {
              // Pflicht-Schritte nur mit Begründung überspringen
              if (step.optional) return void act({ status: 'nicht_noetig' });
              const grund = window.prompt(`„${step.titel}“ ist ein Pflicht-Schritt. Warum ist er hier nicht nötig?`);
              if (grund === null) return;
              void act({ status: 'nicht_noetig', kommentar: grund || 'Pflicht-Schritt übersprungen' });
            }} title="Nicht nötig"
              className="h-8 w-8 rounded-md border border-gray-200 bg-white inline-flex items-center justify-center hover:bg-gray-50 text-gray-500">
              <Ban className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        {done && (
          <button disabled={busy} onClick={() => act({ status: 'offen' })} title="Wieder öffnen"
            className="h-8 w-8 rounded-md border border-gray-200 bg-white inline-flex items-center justify-center hover:bg-gray-50 text-gray-500">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
