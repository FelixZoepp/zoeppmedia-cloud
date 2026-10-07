'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Package, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import { BAUSTEINE, paketVorlage, type Baustein } from '@/lib/fulfillment/pakete';

interface Daten {
  paket: string | null;
  bausteine: Baustein[];
  gesetzt: boolean;
  phase: string | null;
  darfAendern: boolean;
}

/** Paket + gebuchte Leistungen auf der internen Kundenseite – Änderung legt Schritte an bzw. streicht sie */
export function LeistungenCard({ agencyId, onGeaendert }: { agencyId: string; onGeaendert?: () => void }) {
  const [d, setD] = useState<Daten | null>(null);
  const [auswahl, setAuswahl] = useState<Baustein[]>([]);
  const [speichert, setSpeichert] = useState(false);
  const [liveOffen, setLiveOffen] = useState(false);
  const [folgt, setFolgt] = useState<Baustein[]>([]);

  const laden = useCallback(async () => {
    const res = await fetch(`/api/admin/agencies/${agencyId}/leistungen`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as Daten;
    setD(data);
    setAuswahl(data.bausteine);
  }, [agencyId]);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  if (!d) return null;
  const geaendert = auswahl.length !== d.bausteine.length || auswahl.some((b) => !d.bausteine.includes(b));

  async function speichern() {
    setSpeichert(true);
    const res = await fetch(`/api/admin/agencies/${agencyId}/leistungen`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bausteine: auswahl }),
    });
    const data = await res.json().catch(() => ({}));
    setSpeichert(false);
    if (!res.ok) return void toast.error(data.error ?? 'Speichern fehlgeschlagen');
    const teile = [
      data.neu ? `${data.neu} neue Schritte` : null,
      data.entfallen ? `${data.entfallen} Schritte entfallen` : null,
    ].filter(Boolean);
    toast.success(`Leistungen gespeichert${teile.length ? ` – ${teile.join(', ')}` : ''}`);
    await laden();
    onGeaendert?.();
  }

  async function kampagneLive() {
    const namen = folgt.map((b) => BAUSTEINE.find((x) => x.key === b)?.label ?? b).join(', ');
    if (!confirm(`Kampagne als live markieren?${namen ? ` ${namen} folgt noch – diese Schritte bleiben offen.` : ''} Alle übrigen Aufbau-Schritte werden abgehakt.`)) return;
    setSpeichert(true);
    const res = await fetch(`/api/admin/agencies/${agencyId}/kampagne-live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folgt }),
    });
    const data = await res.json().catch(() => ({}));
    setSpeichert(false);
    if (!res.ok) return void toast.error(data.error ?? 'Fehlgeschlagen');
    toast.success(`Kampagne live – ${data.abgehakt} Schritte abgehakt${data.offen?.length ? `, offen: ${data.offen.join(', ')}` : ''}`);
    setLiveOffen(false);
    await laden();
    onGeaendert?.();
  }

  const imAufbau = ['zahlung', 'onboarding', 'setup'].includes(d.phase ?? '');

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
          <Package className="h-5 w-5 text-red-800" /> Paket & Leistungen
        </h2>
        <span className="text-[13.5px] text-gray-600">
          Paket: <strong className="font-semibold text-ink">{paketVorlage(d.paket)?.name ?? d.paket ?? '–'}</strong>
        </span>
      </div>
      <p className="mt-1 text-[13.5px] text-gray-600">
        Bestimmt die Fulfillment-Schritte. Cloud-Zugang und Masterclass sind immer dabei.
        {!d.gesetzt && ' Noch nicht festgelegt – es gilt wie bisher Indeed + Funnel/Meta.'}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {BAUSTEINE.map((b) => {
          const an = auswahl.includes(b.key);
          return (
            <button
              key={b.key}
              type="button"
              disabled={!d.darfAendern}
              aria-pressed={an}
              onClick={() => setAuswahl((prev) => (an ? prev.filter((x) => x !== b.key) : [...prev, b.key]))}
              className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors disabled:cursor-default ${
                an ? 'border-red-700 bg-red-50' : 'border-gray-200 bg-white enabled:hover:border-gray-300'
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  an ? 'border-red-700 bg-red-700 text-white' : 'border-gray-300 bg-white'
                }`}
              >
                {an && <Check className="h-3.5 w-3.5" />}
              </span>
              <span>
                <span className="block text-sm font-semibold text-gray-900">{b.label}</span>
                <span className="block text-xs text-gray-500">{b.hinweis}</span>
              </span>
            </button>
          );
        })}
      </div>

      {d.darfAendern && imAufbau && !geaendert && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          {!liveOffen ? (
            <Button variant="secondary" onClick={() => setLiveOffen(true)}>
              <Rocket className="h-4 w-4" /> Kampagne ist live
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-[13.5px] text-gray-700">Läuft schon alles? Sonst ankreuzen, was noch folgt – diese Schritte bleiben offen, der Rest wird abgehakt.</p>
              <div className="flex flex-wrap gap-2">
                {BAUSTEINE.filter((b) => d.bausteine.includes(b.key)).map((b) => {
                  const an = folgt.includes(b.key);
                  return (
                    <button
                      key={b.key}
                      type="button"
                      aria-pressed={an}
                      onClick={() => setFolgt((prev) => (an ? prev.filter((x) => x !== b.key) : [...prev, b.key]))}
                      className={`rounded-full border px-3 py-1.5 text-[13px] ${an ? 'border-red-700 bg-red-50 font-medium text-red-800' : 'border-gray-200 bg-white text-gray-700'}`}
                    >
                      {an ? '✓ ' : ''}
                      {b.label} folgt noch
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button onClick={kampagneLive} disabled={speichert}>
                  {speichert ? 'Speichert…' : 'Als live markieren'}
                </Button>
                <Button variant="ghost" onClick={() => setLiveOffen(false)}>
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {d.darfAendern && geaendert && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
          <span className="text-[13px] text-gray-600">Neue Schritte werden angelegt, nicht mehr gebuchte offene Schritte entfallen.</span>
          <Button onClick={speichern} disabled={speichert || auswahl.length === 0}>
            {speichert ? 'Speichert…' : 'Leistungen speichern'}
          </Button>
        </div>
      )}
    </Card>
  );
}
