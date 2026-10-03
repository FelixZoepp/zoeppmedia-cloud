'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, PauseCircle, User, Building2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PHASES, stepsForPhase, type Phase } from '@/lib/fulfillment/catalog';
import type { BoardClient } from '@/lib/fulfillment/views';

function tage(n: number): string {
  if (n === 0) return 'seit heute';
  if (n === 1) return 'seit 1 Tag';
  return `seit ${n} Tagen`;
}

function ClientCard({ c, onDragStart }: { c: BoardClient; onDragStart: (id: string) => void }) {
  const pct = c.schritte_gesamt ? Math.round((c.schritte_erledigt / c.schritte_gesamt) * 100) : 0;
  return (
    <Link
      href={`/clients/${c.id}/ablauf`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(c.id);
      }}
    >
      <Card padding="none" className="p-3.5 hover:shadow-md transition-shadow cursor-pointer group space-y-2.5">
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            {c.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-red-600 leading-tight">{c.name}</p>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {tage(c.tage_in_phase)}
            </p>
          </div>
        </div>

        {c.pausiert_grund && (
          <div className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md bg-gray-100 text-gray-700">
            <PauseCircle className="w-3 h-3 flex-shrink-0" /> {c.pausiert_grund}
          </div>
        )}

        {c.schritte_gesamt > 0 && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500">Schritte</span>
              <span className="font-medium text-gray-700">
                {c.schritte_erledigt}/{c.schritte_gesamt}
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {c.naechster_schritt && (
          <div className="text-xs">
            <p className="text-gray-700 leading-snug">→ {c.naechster_schritt.titel}</p>
            <p className="mt-1 flex items-center gap-1.5">
              {c.wartet_auf === 'kunde' ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
                  <Building2 className="w-3 h-3" /> wartet auf Kunde
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-medium">
                  <User className="w-3 h-3" /> {c.naechster_schritt.owner_name ?? 'Team'}
                </span>
              )}
            </p>
          </div>
        )}

        {c.ueberfaellig > 0 && (
          <div className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md bg-red-50 text-red-700">
            <AlertTriangle className="w-3 h-3" /> {c.ueberfaellig} überfällig
          </div>
        )}
      </Card>
    </Link>
  );
}

export function FulfillmentBoard({
  clients,
  onMove,
}: {
  clients: BoardClient[];
  onMove: (agencyId: string, phase: Phase) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Phase | null>(null);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
      {PHASES.map((p) => {
        const col = clients
          .filter((c) => c.phase === p.key)
          .sort((a, b) => b.ueberfaellig - a.ueberfaellig || b.tage_in_phase - a.tage_in_phase);
        return (
          <div key={p.key} className="flex-shrink-0 w-72">
            <div className={`rounded-xl ${p.farbe} px-3 py-2.5 mb-3 text-white`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{p.label}</span>
                <span className="text-xs font-semibold bg-white/25 rounded-full px-2 py-0.5">{col.length}</span>
              </div>
              <p className="text-[11px] opacity-90 mt-0.5 leading-snug">{p.beschreibung}</p>
            </div>

            <div
              className={`space-y-2.5 min-h-[140px] rounded-xl p-2.5 border border-dashed transition-colors ${
                over === p.key ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(p.key);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragging) onMove(dragging, p.key);
                setDragging(null);
              }}
            >
              {col.map((c) => (
                <ClientCard key={c.id} c={c} onDragStart={setDragging} />
              ))}
              {!col.length && <div className="flex items-center justify-center h-16 text-xs text-gray-400">Keine Kunden</div>}
            </div>

            <details className="mt-3 px-1">
              <summary className="text-xs font-medium text-gray-500 cursor-pointer select-none">
                {stepsForPhase(p.key).length} Schritte in dieser Phase
              </summary>
              <ol className="mt-2 space-y-1">
                {stepsForPhase(p.key).map((s) => (
                  <li key={s.key} className="flex gap-2 text-xs text-gray-600">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.wer === 'kunde' ? 'bg-amber-500' : p.farbe}`} />
                    <span>
                      {s.titel}
                      {s.wer === 'kunde' && <span className="text-amber-600"> · Kunde</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          </div>
        );
      })}
    </div>
  );
}
