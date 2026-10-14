'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { KundenAnalyse } from '@/lib/gespraeche/kunde';

interface Gespraech {
  id: string;
  fireflies_id: string;
  titel: string | null;
  datum: string | null;
  dauer_min: number | null;
  art: string;
  stimmung: 'positiv' | 'neutral' | 'kritisch' | null;
  stimmung_score: number | null;
  auswertung: KundenAnalyse | null;
  aufgaben_angelegt: number;
}

const ART: Record<string, string> = { kickoff: 'Kick-off', onboarding: 'Onboarding', service: 'Service-Call', ergebnis: 'Ergebnis-Call', verlaengerung: 'Verlängerung', beschwerde: 'Beschwerde', sonstiges: 'Gespräch' };
const TON = { positiv: 'success', neutral: 'neutral', kritisch: 'danger' } as const;
const ff = (id: string, s?: number) => `https://app.fireflies.ai/view/${id}${s !== undefined ? `?t=${Math.floor(s)}` : ''}`;

/** Kundengespräche aus Fireflies: Stimmung, Zusammenfassung, Zusagen, Risiken, To-dos */
export function KundenGespraecheCard({ agencyId }: { agencyId: string }) {
  const [liste, setListe] = useState<Gespraech[] | null>(null);
  const [offen, setOffen] = useState<string | null>(null);

  useEffect(() => {
    let ab = false;
    fetch(`/api/admin/agencies/${agencyId}/gespraeche`)
      .then((r) => (r.ok ? r.json() : { gespraeche: [] }))
      .then((d: { gespraeche: Gespraech[] }) => !ab && setListe(d.gespraeche))
      .catch(() => !ab && setListe([]));
    return () => {
      ab = true;
    };
  }, [agencyId]);

  if (!liste) return null;
  const mitScore = liste.filter((g) => g.stimmung_score != null);
  const schnitt = mitScore.length ? Math.round((mitScore.reduce((s, g) => s + (g.stimmung_score ?? 0), 0) / mitScore.length) * 10) / 10 : null;

  return (
    <Card className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Kundengespräche</h2>
          <p className="text-xs text-gray-500">Kick-offs, Onboardings und Service-Calls aus Fireflies – automatisch ausgewertet</p>
        </div>
        {schnitt != null && <Badge tone={schnitt >= 7 ? 'success' : schnitt >= 5 ? 'neutral' : 'danger'}>Stimmung Ø {schnitt}/10</Badge>}
      </div>

      {liste.length === 0 ? (
        <p className="text-sm text-gray-500">Noch keine Gespräche. Sobald Fireflies einen Call mit dem Kunden aufnimmt, erscheint er hier.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {liste.map((g) => {
            const a = g.auswertung;
            const auf = offen === g.id;
            return (
              <div key={g.id} className="py-3">
                <button onClick={() => setOffen(auf ? null : g.id)} className="flex w-full items-center justify-between gap-3 text-left">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {ART[g.art] ?? 'Gespräch'} · {g.datum ? new Date(g.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '–'}
                      {g.dauer_min ? ` · ${Math.round(g.dauer_min)} Min.` : ''}
                    </p>
                    {a && !auf && <p className="truncate text-xs text-gray-500">{a.zusammenfassung}</p>}
                  </div>
                  {g.stimmung && <Badge tone={TON[g.stimmung]}>{g.stimmung} {g.stimmung_score}/10</Badge>}
                </button>

                {auf && a && (
                  <div className="mt-3 space-y-3 text-sm text-gray-700">
                    <p>{a.zusammenfassung}</p>
                    <p className="text-xs text-gray-500">Stimmung: {a.stimmung_grund}</p>
                    {a.zitate.length > 0 && (
                      <div className="space-y-1">
                        {a.zitate.map((z, i) => (
                          <a key={i} href={ff(g.fireflies_id, z.sekunden)} target="_blank" rel="noreferrer" className="block text-xs italic text-gray-600 hover:text-red-700">
                            „{z.zitat}“
                          </a>
                        ))}
                      </div>
                    )}
                    <Liste titel="To-dos fürs Team" punkte={a.todos.map((t) => `${t.titel} (${t.fuer}, in ${t.frist_tage} T.)`)} />
                    <Liste titel="Zusagen Zoepp" punkte={a.zusagen_zoepp} />
                    <Liste titel="Zusagen Kunde" punkte={a.zusagen_kunde} />
                    <Liste titel="Risiken" punkte={a.risiken} />
                    {a.upsell_signal && <Liste titel="Upsell-Signal" punkte={[a.upsell_signal]} />}
                    <Liste titel="Infos über den Kunden" punkte={a.kundeninfos.map((k) => `${k.thema}: ${k.info}`)} />
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <a href={ff(g.fireflies_id)} target="_blank" rel="noreferrer" className="font-semibold text-red-700 hover:underline">
                        Aufnahme in Fireflies
                      </a>
                      <span>{g.aufgaben_angelegt ? `${g.aufgaben_angelegt} Aufgaben angelegt` : 'Aufgaben: erst nach Freigabe „To-dos aus Kundengesprächen“'}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function Liste({ titel, punkte }: { titel: string; punkte: string[] }) {
  if (!punkte.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{titel}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {punkte.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
