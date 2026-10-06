'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, Input } from '@/components/ui';
import { AD_STAGES } from '@/lib/ads/constants';
import type { IndeedAnzeige } from '@/lib/indeed/anzeige';

interface Karte {
  id: string;
  stage: string;
  inhalt: IndeedAnzeige | null;
  kunden_kommentar: string | null;
  updated_at: string;
}

interface Daten {
  fehlend: string[];
  anzeige: Karte | null;
}

const BEIM_KUNDEN = ['freigabe_kunde', 'bereit', 'live'];

/** 1-Klick Indeed-Anzeige auf der internen Kundenseite: generieren → prüfen → Kunde gibt frei */
export function IndeedAnzeigeCard({ agencyId }: { agencyId: string }) {
  const [sichtbar, setSichtbar] = useState(false);
  const [d, setD] = useState<Daten | null>(null);
  const [entwurf, setEntwurf] = useState<IndeedAnzeige | null>(null);
  const [geaendert, setGeaendert] = useState(false);
  const [zusatz, setZusatz] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState<null | 'generieren' | 'speichern' | 'freigabe'>(null);

  const uebernehmen = useCallback((anzeige: Karte | null) => {
    setEntwurf(anzeige?.inhalt ?? null);
    setGeaendert(false);
  }, []);

  const laden = useCallback(async () => {
    const [l, a] = await Promise.all([
      fetch(`/api/admin/agencies/${agencyId}/leistungen`, { cache: 'no-store' }),
      fetch(`/api/admin/agencies/${agencyId}/indeed-anzeige`, { cache: 'no-store' }),
    ]);
    if (l.ok) setSichtbar(((await l.json()).bausteine as string[]).includes('indeed'));
    if (a.ok) {
      const data = (await a.json()) as Daten;
      setD(data);
      uebernehmen(data.anzeige);
    }
  }, [agencyId, uebernehmen]);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  if (!sichtbar || !d) return null;
  const karte = d.anzeige;
  const beimKunden = !!karte && BEIM_KUNDEN.includes(karte.stage);
  const stage = AD_STAGES.find((s) => s.key === karte?.stage);

  function feld<K extends keyof IndeedAnzeige>(k: K, v: IndeedAnzeige[K]) {
    setEntwurf((e) => (e ? { ...e, [k]: v } : e));
    setGeaendert(true);
  }

  async function generieren() {
    setBusy('generieren');
    const res = await fetch(`/api/admin/agencies/${agencyId}/indeed-anzeige`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zusatz: zusatz || undefined, feedback: karte ? feedback || undefined : undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return void toast.error(data.error ?? 'Generierung fehlgeschlagen');
    toast.success(karte && feedback ? 'Anzeige überarbeitet' : 'Indeed-Anzeige erstellt – bitte prüfen');
    setFeedback('');
    setD((prev) => (prev ? { ...prev, anzeige: data.anzeige } : prev));
    uebernehmen(data.anzeige);
  }

  async function speichern(aktion?: 'zur_freigabe') {
    setBusy(aktion ? 'freigabe' : 'speichern');
    const res = await fetch(`/api/admin/agencies/${agencyId}/indeed-anzeige`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(geaendert && entwurf ? { inhalt: entwurf } : {}), aktion }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return void toast.error(data.error ?? 'Speichern fehlgeschlagen');
    toast.success(aktion ? 'An den Kunden zur Freigabe geschickt' : 'Gespeichert');
    setD((prev) => (prev ? { ...prev, anzeige: data.anzeige } : prev));
    uebernehmen(data.anzeige);
  }

  async function kopieren() {
    if (!entwurf) return;
    try {
      await navigator.clipboard.writeText(`${entwurf.titel}\n\n${entwurf.text}`);
      toast.success('Titel und Text kopiert – bei Indeed einfügen');
    } catch {
      toast.error('Kopieren nicht möglich');
    }
  }

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
          <Sparkles className="h-5 w-5 text-red-800" /> Indeed-Anzeige
        </h2>
        {stage && <Badge tone={karte?.stage === 'bereit' || karte?.stage === 'live' ? 'success' : 'neutral'}>{stage.label}</Badge>}
      </div>

      {d.fehlend.length > 0 ? (
        <div className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-[13.5px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Im Onboarding fehlt noch: <strong>{d.fehlend.join(', ')}</strong>. Trag es unten aus dem Gespräch ein oder lass den Kunden das Formular ausfüllen.
          </span>
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-[13.5px] text-green-700">
          <CheckCircle2 className="h-4 w-4" /> Briefing vollständig – die Anzeige kann direkt erstellt werden.
        </p>
      )}

      {karte?.stage !== 'freigabe_kunde' ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={zusatz}
            onChange={(e) => setZusatz(e.target.value)}
            rows={2}
            placeholder="Infos aus dem Gespräch (optional): Verdienst, Benefits, Besonderheiten …"
            className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
          {karte && (
            <Input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback für die Überarbeitung, z. B. „kürzer, mehr zum Firmenwagen“" />
          )}
          <Button onClick={generieren} disabled={busy !== null}>
            <Sparkles className="h-4 w-4" />
            {busy === 'generieren' ? 'Wird geschrieben … (bis zu 1 Minute)' : karte ? (feedback ? 'Mit Feedback überarbeiten' : beimKunden ? 'Neue Version generieren' : 'Neu generieren') : 'Indeed-Anzeige generieren'}
          </Button>
        </div>
      ) : null}

      {karte?.kunden_kommentar && (
        <div className="mt-3 rounded-xl bg-red-50 p-3 text-[13.5px] text-red-900">
          <strong>Änderungswunsch vom Kunden:</strong> {karte.kunden_kommentar}
        </div>
      )}

      {entwurf && (
        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          {entwurf.offene_punkte.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-[13.5px] text-amber-900">
              <strong>Vor dem Schalten prüfen:</strong>
              <ul className="mt-1 list-disc pl-5">
                {entwurf.offene_punkte.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="sm:col-span-3 text-[13px] font-medium text-gray-700">
              Titel
              <Input value={entwurf.titel} disabled={beimKunden} onChange={(e) => feld('titel', e.target.value)} />
            </label>
            <label className="text-[13px] font-medium text-gray-700">
              Arbeitsort
              <Input value={entwurf.arbeitsort} disabled={beimKunden} onChange={(e) => feld('arbeitsort', e.target.value)} />
            </label>
            <label className="text-[13px] font-medium text-gray-700">
              Anstellungsart
              <Input value={entwurf.anstellungsart} disabled={beimKunden} onChange={(e) => feld('anstellungsart', e.target.value)} />
            </label>
            <div className="text-[13px] font-medium text-gray-700">
              Gehalt (€ von – bis{entwurf.gehalt_zeitraum ? ` pro ${entwurf.gehalt_zeitraum}` : ''})
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={entwurf.gehalt_von ?? ''}
                  disabled={beimKunden}
                  onChange={(e) => feld('gehalt_von', e.target.value ? Number(e.target.value) : null)}
                />
                <Input
                  type="number"
                  value={entwurf.gehalt_bis ?? ''}
                  disabled={beimKunden}
                  onChange={(e) => feld('gehalt_bis', e.target.value ? Number(e.target.value) : null)}
                />
              </div>
            </div>
          </div>
          <label className="block text-[13px] font-medium text-gray-700">
            Anzeigentext
            <textarea
              value={entwurf.text}
              disabled={beimKunden}
              onChange={(e) => feld('text', e.target.value)}
              rows={16}
              className="mt-1 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-relaxed disabled:bg-gray-50"
            />
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={kopieren}>
              <Copy className="h-4 w-4" /> Kopieren
            </Button>
            {!beimKunden && geaendert && (
              <Button variant="secondary" onClick={() => speichern()} disabled={busy !== null}>
                {busy === 'speichern' ? 'Speichert …' : 'Änderungen speichern'}
              </Button>
            )}
            {!beimKunden && (
              <Button onClick={() => speichern('zur_freigabe')} disabled={busy !== null}>
                <Send className="h-4 w-4" /> {busy === 'freigabe' ? 'Wird geschickt …' : 'An Kunden zur Freigabe'}
              </Button>
            )}
          </div>
          {karte?.stage === 'freigabe_kunde' && (
            <p className="text-right text-[13px] text-gray-600">Liegt beim Kunden unter „Deine Aufgaben“ – du wirst benachrichtigt, sobald er freigibt.</p>
          )}
          {karte?.stage === 'bereit' && (
            <p className="text-right text-[13px] text-green-700">Freigegeben – jetzt bei Indeed schalten und im Ads-Board auf „Live“ setzen.</p>
          )}
        </div>
      )}
    </Card>
  );
}
