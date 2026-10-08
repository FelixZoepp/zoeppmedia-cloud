'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, ChevronRight, HelpCircle, MessageCircleQuestion, PlayCircle, X } from 'lucide-react';
import { videoEmbedUrl } from '@/lib/masterclass/lesson';
import { vorgangVon } from '@/lib/akademie/hilfe-zuordnung';
import { ChecklisteBaustein, ReviewBaustein } from './bausteine';
import { HILFE_ERLEDIGEN_EVENT, HILFE_KONTEXT_EVENT, type ErledigenAnfrage, type HilfeKontext } from './hilfe-bus';

interface Thema {
  slug: string;
  titel: string;
  typ: string;
  zusammenfassung: string | null;
  schritte: string[];
  automatisch: string[];
  checkliste: string[];
  review: string[];
  video: { titel: string; url: string | null; datei?: boolean; status: string; laenge_min: number } | null;
  erledigt: number[];
}

interface Antwort {
  hilfeModus: boolean;
  themen: Thema[];
  zugeordnet: boolean;
  keineAnleitung: boolean;
}

const OFFEN_KEY = 'zmc-hilfe-offen';

/** Nicht blockierender Hinweis vor „Erledigt“, wenn die Checkliste noch offen ist */
function ErledigenHinweis({ titel, offen, onZurCheckliste, onTrotzdem }: { titel: string; offen: string[]; onZurCheckliste: () => void; onTrotzdem: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-[18px] bg-card p-5 shadow-xl">
        <h3 className="text-[17px] font-semibold">Fast fertig – {offen.length} Punkt{offen.length === 1 ? '' : 'e'} offen</h3>
        <p className="mt-1 text-[14px] text-gray-600">Laut Checkliste „{titel}“ fehlt noch:</p>
        <ul className="mt-2 max-h-56 list-disc space-y-1 overflow-auto pl-5 text-[14.5px]">
          {offen.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button onClick={onTrotzdem} className="rounded-full bg-panel px-4 py-2 text-[14px] font-medium text-gray-700">Trotzdem erledigen</button>
          <button onClick={onZurCheckliste} className="rounded-full bg-red-950 px-4 py-2 text-[14px] font-medium text-red-50">Zur Checkliste</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hilfe-Leiste (Hilfe-Modus): zeigt zur geöffneten Aufgabe bzw. Seite die passende SOP mit
 * Video, Schritten, Checkliste (pro Vorgang) und Review-Checkliste. Nur intern eingebunden.
 */
export function HilfeLeiste() {
  const pfad = usePathname() ?? '';
  const [aufgabe, setAufgabe] = useState<HilfeKontext | null>(null);
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const [zeigeReview, setZeigeReview] = useState(false);
  const [hinweis, setHinweis] = useState<{ anfrage: ErledigenAnfrage; titel: string; offen: string[] } | null>(null);

  const kontext = useMemo(() => vorgangVon({ stepId: aufgabe?.stepId, pfad }), [aufgabe, pfad]);

  // Beim Seitenwechsel gehört die Aufgabe nicht mehr dazu (State während des Renderns anpassen)
  const [pfadAlt, setPfadAlt] = useState(pfad);
  if (pfad !== pfadAlt) {
    setPfadAlt(pfad);
    setAufgabe(null);
    setAktiv(0);
    setZeigeReview(false);
  }

  const ersteLadung = useRef(true);
  useEffect(() => {
    let aktuell = true;
    const qs = new URLSearchParams({ pfad, kontext });
    if (aufgabe?.stepKey) qs.set('step', aufgabe.stepKey);
    if (offen) qs.set('offen', '1');
    fetch(`/api/akademie/hilfe?${qs}`)
      .then((r) => (r.ok ? (r.json() as Promise<Antwort>) : null))
      .then((d) => {
        if (!aktuell || !d) return;
        setDaten(d);
        window.__zmcHilfeAktiv = d.hilfeModus;
        if (!ersteLadung.current) return;
        ersteLadung.current = false;
        // Gemerkter Zustand der Leiste; beim allerersten Mal mit Hilfe-Modus und passender SOP offen zeigen
        try {
          const gemerkt = localStorage.getItem(OFFEN_KEY);
          if (gemerkt === '1' || (gemerkt === null && d.hilfeModus && d.themen.length && window.matchMedia('(min-width: 1280px)').matches)) setOffen(true);
        } catch {
          /* Speicher nicht verfügbar */
        }
      })
      .catch(() => undefined);
    return () => {
      aktuell = false;
    };
  }, [pfad, kontext, aufgabe, offen]);

  // Aufgabe geöffnet/fokussiert → Leiste auf diese SOP
  useEffect(() => {
    const onKontext = (e: Event) => {
      const k = (e as CustomEvent<HilfeKontext>).detail;
      setAufgabe(k);
      setAktiv(0);
      setZeigeReview(false);
      if (daten?.hilfeModus) setOffen(true);
    };
    window.addEventListener(HILFE_KONTEXT_EVENT, onKontext);
    return () => window.removeEventListener(HILFE_KONTEXT_EVENT, onKontext);
  }, [daten?.hilfeModus]);

  // „Erledigt“ geklickt → Checkliste prüfen
  useEffect(() => {
    const onErledigen = async (e: Event) => {
      const anfrage = (e as CustomEvent<ErledigenAnfrage>).detail;
      const r = await fetch('/api/akademie/erledigt-hinweis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stepKey: anfrage.stepKey, kontext: anfrage.kontext }) }).catch(() => null);
      const d = r?.ok ? ((await r.json()) as { slug: string | null; titel?: string; offen: string[] }) : null;
      if (!d?.slug || !d.offen.length) {
        anfrage.resolve(true);
        if (d?.slug) {
          // Danach Review anbieten
          setAufgabe({ stepKey: anfrage.stepKey, stepId: anfrage.kontext.replace(/^step:/, '') });
          setZeigeReview(true);
          setOffen(true);
        }
        return;
      }
      setHinweis({ anfrage, titel: d.titel ?? 'SOP', offen: d.offen });
    };
    window.addEventListener(HILFE_ERLEDIGEN_EVENT, onErledigen);
    return () => window.removeEventListener(HILFE_ERLEDIGEN_EVENT, onErledigen);
  }, []);

  function entscheide(aktion: 'trotzdem' | 'zur_checkliste') {
    if (!hinweis) return;
    const { anfrage, offen: offenePunkte } = hinweis;
    void fetch('/api/akademie/erledigt-hinweis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stepKey: anfrage.stepKey, kontext: anfrage.kontext, aktion, offen: offenePunkte }) });
    setAufgabe({ stepKey: anfrage.stepKey, stepId: anfrage.kontext.replace(/^step:/, '') });
    setZeigeReview(aktion === 'trotzdem');
    setOffen(true);
    setHinweis(null);
    anfrage.resolve(aktion === 'trotzdem');
  }

  function setzeOffen(v: boolean) {
    setOffen(v);
    try {
      localStorage.setItem(OFFEN_KEY, v ? '1' : '0');
    } catch {
      /* egal */
    }
  }

  async function schalteModus() {
    const neu = !daten?.hilfeModus;
    await fetch('/api/akademie/hilfe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hilfeModus: neu }) });
    window.__zmcHilfeAktiv = neu;
    setDaten((d) => (d ? { ...d, hilfeModus: neu } : d));
  }

  const themen = daten?.themen ?? [];
  const t = themen[Math.min(aktiv, themen.length - 1)] ?? null;
  const datei = t?.video?.datei && t.video.url ? t.video.url : null;
  const embed = !datei && t?.video?.url ? videoEmbedUrl(t.video.url) : null;
  const hatHilfe = themen.length > 0;

  return (
    <>
      {hinweis && <ErledigenHinweis titel={hinweis.titel} offen={hinweis.offen} onTrotzdem={() => entscheide('trotzdem')} onZurCheckliste={() => entscheide('zur_checkliste')} />}

      {!offen && (
        <button
          onClick={() => setzeOffen(true)}
          className={`fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 items-center gap-1 rounded-l-[12px] px-2 py-3 text-[12.5px] font-medium shadow-md sm:flex ${hatHilfe && daten?.hilfeModus ? 'bg-red-950 text-red-50' : 'bg-card text-gray-600'}`}
          style={{ writingMode: 'vertical-rl' }}
          title="Hilfe zu dieser Seite"
        >
          <HelpCircle className="h-4 w-4 rotate-90" /> Hilfe{hatHilfe ? ` (${themen.length})` : ''}
        </button>
      )}
      {!offen && (
        <button onClick={() => setzeOffen(true)} className="fixed bottom-20 left-4 z-40 flex items-center gap-1 rounded-full bg-card px-3 py-2 text-[13px] font-medium text-gray-700 shadow-md sm:hidden">
          <HelpCircle className="h-4 w-4" /> Hilfe
        </button>
      )}

      {offen && (
        <aside className="fixed inset-x-0 bottom-0 z-50 flex max-h-[75vh] flex-col rounded-t-[18px] border-t border-[var(--hair)] bg-card shadow-2xl sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-0 sm:max-h-none sm:w-[380px] sm:rounded-none sm:border-l sm:border-t-0">
          <div className="flex items-center gap-2 border-b border-[var(--hair)] px-4 py-3">
            <HelpCircle className="h-4 w-4 text-red-800" />
            <span className="text-[15px] font-semibold">Hilfe</span>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[12.5px] text-gray-600">
              <input type="checkbox" checked={!!daten?.hilfeModus} onChange={() => void schalteModus()} />
              Hilfe-Modus
            </label>
            <button onClick={() => setzeOffen(false)} className="rounded-full p-1 text-gray-500 hover:bg-panel" aria-label="Hilfe schließen">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {!daten && <p className="text-[14px] text-gray-500">Lädt …</p>}
            {daten?.keineAnleitung && (
              <p className="rounded-[12px] bg-panel px-3 py-2 text-[14px] text-gray-600">
                Für diesen Bereich ist noch keine Anleitung freigegeben. Die Frage ist an Felix weitergeleitet. Bis dahin: <Link href="/akademie" className="text-red-800 underline">Akademie durchsuchen</Link>.
              </p>
            )}

            {themen.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {themen.map((x, i) => (
                  <button key={x.slug} onClick={() => { setAktiv(i); setZeigeReview(false); }} className={`rounded-full px-3 py-1 text-[12.5px] ${i === aktiv ? 'bg-red-950 text-red-50' : 'bg-panel text-gray-700'}`}>
                    {x.titel}
                  </button>
                ))}
              </div>
            )}

            {t && (
              <div className="space-y-4">
                <div>
                  {aufgabe?.titel && <p className="text-[12px] uppercase tracking-[0.06em] text-gray-500">Zur Aufgabe: {aufgabe.titel}</p>}
                  <h3 className="text-[16px] font-semibold leading-snug">{t.titel}</h3>
                  {t.zusammenfassung && <p className="mt-0.5 text-[13.5px] text-gray-600">{t.zusammenfassung}</p>}
                </div>

                <section>
                  <h4 className="mb-1 flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-gray-500"><PlayCircle className="h-3.5 w-3.5" /> 1 · Video</h4>
                  {datei ? (
                    <video src={datei} controls preload="metadata" className="aspect-video w-full rounded-[12px] bg-black" />
                  ) : embed ? (
                    <div className="relative aspect-video overflow-hidden rounded-[12px] bg-black">
                      <iframe src={embed} className="absolute inset-0 h-full w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title={t.video?.titel ?? t.titel} />
                    </div>
                  ) : (
                    <p className="text-[13.5px] text-gray-500">{t.video ? `Video „${t.video.titel}“ folgt.` : 'Kein Video nötig – die SOP reicht.'}</p>
                  )}
                </section>

                <section>
                  <h4 className="mb-1 flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-gray-500"><BookOpen className="h-3.5 w-3.5" /> 2 · SOP</h4>
                  {!!t.automatisch.length && (
                    <ul className="mb-2 list-disc space-y-0.5 rounded-[10px] bg-green-50 py-1.5 pl-6 pr-2 text-[13px] text-green-900">
                      {t.automatisch.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  )}
                  {t.schritte.length ? (
                    <ol className="list-decimal space-y-1 pl-5 text-[13.5px]">{t.schritte.map((x, i) => <li key={i}>{x}</li>)}</ol>
                  ) : (
                    <p className="text-[13.5px] text-gray-500">Details in der ganzen SOP.</p>
                  )}
                </section>

                <section>
                  <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-gray-500">3 · Checkliste</h4>
                  <ChecklisteBaustein key={`${t.slug}|${kontext}`} slug={t.slug} punkte={t.checkliste} kontext={kontext} start={t.erledigt} klein onKomplett={(k) => k && setZeigeReview(true)} />
                </section>

                <section>
                  <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-gray-500">4 · Review</h4>
                  {zeigeReview ? (
                    <ReviewBaustein key={`r|${t.slug}|${kontext}`} slug={t.slug} punkte={t.review} kontext={kontext} klein />
                  ) : (
                    <button onClick={() => setZeigeReview(true)} className="text-[13.5px] text-red-800 hover:underline">Review-Checkliste öffnen (nach dem Abarbeiten)</button>
                  )}
                </section>

                <div className="flex flex-wrap gap-2 border-t border-[var(--hair)] pt-3">
                  <Link href={`/akademie/${t.slug}`} className="inline-flex items-center gap-1 rounded-full bg-panel px-3 py-1.5 text-[13px] text-gray-700 hover:text-red-800">
                    Ganze SOP öffnen <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link href={`/akademie?frage=${encodeURIComponent(`Zu „${t.titel}“: `)}&quelle=${encodeURIComponent(t.slug)}`} className="inline-flex items-center gap-1 rounded-full bg-panel px-3 py-1.5 text-[13px] text-gray-700 hover:text-red-800">
                    <MessageCircleQuestion className="h-3.5 w-3.5" /> Frag die Akademie
                  </Link>
                </div>
              </div>
            )}

            {daten && !daten.keineAnleitung && !t && <p className="text-[14px] text-gray-500">Zu dieser Seite gibt es noch keine Hilfe.</p>}
          </div>
        </aside>
      )}
    </>
  );
}
