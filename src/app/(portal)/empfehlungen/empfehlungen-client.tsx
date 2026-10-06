'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BrainCircuit, Check, CheckCircle2, Clapperboard, Globe, Lightbulb, Loader2, Lock, Megaphone, Package, Rocket, Sparkles, Users, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Modal, PageHeader } from '@/components/ui';
import type { Empfehlung, KundenLage } from '@/lib/empfehlungen/regeln';
import { freischaltKarten, type FreischaltKarte } from '@/lib/empfehlungen/leistungen';

interface Daten {
  lage: KundenLage | null;
  empfehlungen: Empfehlung[];
}

export function EmpfehlungenClient() {
  const [d, setD] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gemeldet, setGemeldet] = useState<Set<string>>(() => new Set());
  const [offen, setOffen] = useState<{ id: string; titel: string } | null>(null);
  const [notiz, setNotiz] = useState('');
  const [sendet, setSendet] = useState(false);

  const laden = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([fetch('/api/empfehlungen', { cache: 'no-store' }), fetch('/api/support', { cache: 'no-store' })]);
      const daten = await r.json();
      if (!r.ok) throw new Error(daten.error ?? 'Fehler');
      setD(daten);
      if (s.ok) {
        const anfragen = (await s.json()) as Array<{ art: string; empfehlung_id: string | null; status: string }>;
        setGemeldet(new Set(anfragen.filter((a) => a.art === 'interesse' && a.empfehlung_id && a.status !== 'erledigt').map((a) => a.empfehlung_id as string)));
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Empfehlungen konnten nicht geladen werden');
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function melden() {
    if (!offen) return;
    setSendet(true);
    const res = await fetch('/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ art: 'interesse', thema: offen.titel, nachricht: notiz.trim() || null, empfehlungId: offen.id }),
    });
    const daten = await res.json().catch(() => ({}));
    setSendet(false);
    if (!res.ok) return toast.error(daten.error ?? 'Konnte nicht gesendet werden');
    setGemeldet((g) => new Set(g).add(offen.id));
    toast.success('Danke! Dein Ansprechpartner meldet sich bei dir.');
    setOffen(null);
    setNotiz('');
  }

  const tipps = d?.empfehlungen.filter((e) => e.art === 'tipp') ?? [];
  const karten = d ? freischaltKarten(d.lage, d.empfehlungen) : [];
  const l = d?.lage;

  return (
    <div>
      <PageHeader title="Empfehlungen" description="Was dich jetzt am meisten weiterbringt – aus deinen Zahlen der letzten 30 Tage." />

      {fehler && (
        <Card className="mb-4 flex items-start gap-3 text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
          <p className="text-[14px]">{fehler}</p>
        </Card>
      )}

      {!d ? (
        !fehler && (
          <div className="flex justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
          </div>
        )
      ) : (
        <div className="space-y-8">
          {l && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Bewerber (30 T.)', wert: String(l.bewerber30) },
                { label: 'Kontaktiert', wert: l.kontaktquote === null ? '–' : `${l.kontaktquote} %` },
                { label: 'Termine (30 T.)', wert: String(l.termine30) },
                { label: 'Einstellungen (30 T.)', wert: String(l.einstellungen30) },
              ].map((k, i) => (
                <Card key={k.label} hero={i === 0} className="fx-rise" style={{ '--d': `${i * 50}ms` } as React.CSSProperties}>
                  <p className={`text-[13px] ${i === 0 ? 'text-red-200' : 'text-gray-600'}`}>{k.label}</p>
                  <p className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.03em]">{k.wert}</p>
                </Card>
              ))}
            </div>
          )}

          {tipps.length === 0 && karten.length === 0 ? (
            <Card inset>
              <div className="flex flex-col items-center py-12 text-center">
                <CheckCircle2 className="h-9 w-9 text-green-600" />
                <p className="mt-3 text-[17px] font-medium">Läuft rund – aktuell keine Empfehlungen</p>
                <p className="mt-1 max-w-md text-[14px] text-gray-600">Sobald deine Zahlen etwas hergeben, findest du hier konkrete Tipps.</p>
              </div>
            </Card>
          ) : (
            <>
              {tipps.length > 0 && (
                <section>
                  <h2 className="mb-1 flex items-center gap-2 px-1 text-[20px] font-medium tracking-[-0.02em]">
                    <Lightbulb className="h-5 w-5 text-red-800" /> Sofort umsetzbar
                  </h2>
                  <p className="mb-3 px-1 text-[13.5px] text-gray-600">Kostenlos – direkt in deiner Cloud erledigt.</p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {tipps.map((e, i) => (
                      <Card key={e.id} className="fx-rise flex flex-col" style={{ '--d': `${i * 50}ms` } as React.CSSProperties}>
                        <h3 className="text-[17px] font-medium tracking-[-0.02em]">{e.titel}</h3>
                        <p className="mt-2 text-[13.5px] font-medium text-red-800">{e.warum}</p>
                        <p className="mt-1.5 text-[14px] leading-snug text-gray-700">{e.nutzen}</p>
                        {e.link && (
                          <Link href={e.link.href} className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[14px] font-medium text-red-800 hover:underline">
                            {e.link.label} <ArrowRight className="h-4 w-4" />
                          </Link>
                        )}
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              {karten.length > 0 && (
                <section>
                  <h2 className="mb-1 flex items-center gap-2 px-1 text-[20px] font-medium tracking-[-0.02em]">
                    <Rocket className="h-5 w-5 text-red-800" /> Freischaltbare Funktionen
                  </h2>
                  <p className="mb-4 px-1 text-[13.5px] text-gray-600">Noch gesperrt in deiner Cloud – schalte frei, was dich jetzt am schnellsten wachsen lässt.</p>
                  <div className="space-y-5">
                    {karten.map((k, i) => (
                      <GesperrteKarte key={k.id} k={k} index={i} angefragt={gemeldet.has(k.id)} onFreischalten={() => setOffen({ id: k.id, titel: k.titel })} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      <Modal open={!!offen} onClose={() => setOffen(null)} title="Freischaltung anfragen">
        {offen && (
          <div className="space-y-4">
            <p className="text-[14.5px] text-gray-700">
              Du möchtest <strong className="text-ink">„{offen.titel}“</strong> freischalten. Dein Ansprechpartner meldet sich zeitnah bei dir, bespricht Umfang und Start – unverbindlich.
            </p>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-gray-600">Notiz (optional)</span>
              <textarea
                value={notiz}
                onChange={(ev) => setNotiz(ev.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="z. B. Wann du am besten erreichbar bist"
                className="w-full rounded-[12px] bg-card px-3.5 py-2.5 text-[15px] shadow-[inset_0_0_0_1.5px_var(--hair)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--r-700)]"
              />
            </label>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setOffen(null)} className="flex-1">
                Abbrechen
              </Button>
              <Button onClick={melden} disabled={sendet} className="flex-1">
                {sendet ? <Loader2 className="animate-spin" /> : <Sparkles />} Jetzt freischalten
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const ICONS: Record<FreischaltKarte['icon'], React.ReactNode> = {
  persona: <BrainCircuit />,
  reichweite: <Megaphone />,
  prozess: <Workflow />,
  workshop: <Users />,
  film: <Clapperboard />,
  seite: <Globe />,
  paket: <Package />,
};

/** Große gesperrte Funktion: alle Vorteile, Kundenbeispiel, „Jetzt freischalten“ */
function GesperrteKarte({ k, index, angefragt, onFreischalten }: { k: FreischaltKarte; index: number; angefragt: boolean; onFreischalten: () => void }) {
  return (
    <Card
      padding="lg"
      className={`fx-rise relative overflow-hidden ${k.empfohlen ? 'shadow-[inset_0_0_0_2px_var(--r-700)]' : ''}`}
      style={{ '--d': `${Math.min(index, 8) * 60}ms` } as React.CSSProperties}
    >
      {/* Schloss-Band */}
      <div className="absolute right-0 top-0 flex items-center gap-1.5 rounded-bl-[16px] bg-ink px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-white">
        <Lock className="h-3.5 w-3.5" /> Gesperrt
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex items-center gap-3.5 pr-24">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-[14px] bg-gradient-to-b from-red-700 to-red-950 text-red-50 [&_svg]:h-6 [&_svg]:w-6">
              {ICONS[k.icon]}
            </span>
            <div className="min-w-0">
              <h3 className="text-[22px] font-semibold leading-tight tracking-[-0.03em]">{k.titel}</h3>
              <p className="text-[14.5px] text-gray-600">{k.untertitel}</p>
            </div>
          </div>

          {k.empfohlen && k.warum && (
            <p className="mt-4 flex items-start gap-2 rounded-[14px] bg-red-50 px-3.5 py-2.5 text-[14px] text-red-900">
              <Sparkles className="mt-0.5 h-4 w-4 flex-none" />
              <span>
                <strong>Für dich empfohlen:</strong> {k.warum}
              </span>
            </p>
          )}

          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {k.vorteile.map((v) => (
              <li key={v} className="flex items-start gap-2.5 text-[14.5px] leading-snug">
                <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-green-100 text-green-700">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {v}
              </li>
            ))}
          </ul>

          <div className="mt-6">
            {angefragt ? (
              <p className="inline-flex items-center gap-2 rounded-full bg-green-50 px-4 py-2.5 text-[14.5px] font-medium text-green-800">
                <CheckCircle2 className="h-5 w-5" /> Freischaltung angefragt – dein Ansprechpartner meldet sich
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={onFreischalten}>
                  <Lock /> Jetzt freischalten
                </Button>
                <span className="text-[13px] text-gray-500">Unverbindlich – dein Ansprechpartner bespricht alles mit dir.</span>
              </div>
            )}
          </div>
        </div>

        {/* Kundenbeispiel */}
        <div className="flex flex-col justify-between rounded-[20px] bg-gradient-to-br from-red-800 to-red-950 p-5 text-red-50 sm:p-6">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-red-200">Kundenbeispiel</p>
            <p className="mt-3 text-[clamp(36px,4.5vw,52px)] font-semibold leading-none tracking-[-0.04em]">{k.beispiel.kennzahl}</p>
            <p className="mt-1.5 text-[15px] text-red-100">{k.beispiel.kennzahlText}</p>
            <p className="mt-4 text-[14.5px] leading-snug text-red-50/90">{k.beispiel.text}</p>
          </div>
          <p className="mt-5 border-t border-white/15 pt-3 text-[13px] text-red-200">
            <strong className="font-semibold text-red-50">{k.beispiel.kunde}</strong> · {k.beispiel.branche}
          </p>
        </div>
      </div>
    </Card>
  );
}
