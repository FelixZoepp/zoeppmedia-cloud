'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Lightbulb, Loader2, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Modal, PageHeader } from '@/components/ui';
import type { Empfehlung, KundenLage } from '@/lib/empfehlungen/regeln';

interface Daten {
  lage: KundenLage | null;
  empfehlungen: Empfehlung[];
}

export function EmpfehlungenClient() {
  const [d, setD] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gemeldet, setGemeldet] = useState<Set<string>>(() => new Set());
  const [offen, setOffen] = useState<Empfehlung | null>(null);
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
  const leistungen = d?.empfehlungen.filter((e) => e.art === 'leistung') ?? [];
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

          {d.empfehlungen.length === 0 ? (
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

              {leistungen.length > 0 && (
                <section>
                  <h2 className="mb-1 flex items-center gap-2 px-1 text-[20px] font-medium tracking-[-0.02em]">
                    <Rocket className="h-5 w-5 text-red-800" /> Für mehr Wachstum
                  </h2>
                  <p className="mb-3 px-1 text-[13.5px] text-gray-600">Passend zu deinen Zahlen – dein Ansprechpartner bespricht die Details mit dir.</p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {leistungen.map((e, i) => {
                      const schon = gemeldet.has(e.id);
                      return (
                        <Card key={e.id} className="fx-rise flex flex-col" style={{ '--d': `${i * 50}ms` } as React.CSSProperties}>
                          <h3 className="text-[17px] font-medium tracking-[-0.02em]">{e.titel}</h3>
                          <p className="mt-2 text-[13.5px] font-medium text-red-800">{e.warum}</p>
                          <p className="mt-1.5 text-[14px] leading-snug text-gray-700">{e.nutzen}</p>
                          <div className="mt-auto pt-4">
                            {schon ? (
                              <p className="flex items-center gap-1.5 text-[14px] font-medium text-green-700">
                                <CheckCircle2 className="h-4 w-4" /> Dein Ansprechpartner meldet sich bei dir
                              </p>
                            ) : (
                              <Button onClick={() => setOffen(e)} className="w-full">
                                Interesse melden
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      <Modal open={!!offen} onClose={() => setOffen(null)} title="Interesse melden">
        {offen && (
          <div className="space-y-4">
            <p className="text-[14.5px] text-gray-700">
              Wir geben deinem Ansprechpartner Bescheid zu <strong className="text-ink">„{offen.titel}“</strong>. Er meldet sich bei dir und bespricht alles Weitere – unverbindlich.
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
                {sendet ? <Loader2 className="animate-spin" /> : null} Interesse senden
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
