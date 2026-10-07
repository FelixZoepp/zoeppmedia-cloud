'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Copy, Loader2, Sparkles, XCircle, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import type { FunnelTexte, TeilKey, WebseitenVideo } from '@/lib/fulfillment/generator';

interface Daten {
  fehlend: string[];
  teile: Array<{ key: TeilKey; label: string }>;
  generierung: { id: string; status: 'laeuft' | 'fertig' | 'fehler'; teile: Record<string, string>; gestartet_am: string; fertig_am: string | null } | null;
  funnel: { inhalt: FunnelTexte; created_at: string } | null;
  webseitenVideo: { inhalt: WebseitenVideo; created_at: string } | null;
}

async function kopieren(text: string, was: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${was} kopiert`);
  } catch {
    toast.error('Kopieren nicht möglich');
  }
}

function TeilStatus({ status }: { status: string | undefined }) {
  if (status === 'fertig') return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-700" />;
  if (status === 'laeuft') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-red-800" />;
  if (status?.startsWith('fehler')) return <XCircle className="h-4 w-4 shrink-0 text-red-700" />;
  return <Circle className="h-4 w-4 shrink-0 text-gray-300" />;
}

/** Fulfillment-Generator: ein Klick → Ad-Konzepte, Video-Skripte, Webseiten-Video, Funnel-Texte, Indeed-Anzeige */
export function GeneratorCard({ agencyId }: { agencyId: string }) {
  const [d, setD] = useState<Daten | null>(null);
  const [zusatz, setZusatz] = useState('');
  const [startet, setStartet] = useState(false);

  const laden = useCallback(async () => {
    const r = await fetch(`/api/admin/agencies/${agencyId}/generator`, { cache: 'no-store' });
    if (r.ok) setD(await r.json());
  }, [agencyId]);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  // Während eine Generierung läuft, alle 4 Sekunden Fortschritt holen
  const laeuft = d?.generierung?.status === 'laeuft';
  useEffect(() => {
    if (!laeuft) return;
    const t = setInterval(laden, 4000);
    return () => clearInterval(t);
  }, [laeuft, laden]);

  if (!d || !d.teile.length) return null;

  async function starten() {
    setStartet(true);
    const r = await fetch(`/api/admin/agencies/${agencyId}/generator`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zusatz: zusatz || undefined }),
    });
    const data = await r.json().catch(() => ({}));
    setStartet(false);
    if (!r.ok) return void toast.error(data.error ?? 'Start fehlgeschlagen');
    toast.success('Läuft – du kannst weiterarbeiten, das dauert 1–3 Minuten');
    void laden();
  }

  const gen = d.generierung;
  const f = d.funnel?.inhalt;
  const w = d.webseitenVideo?.inhalt;

  return (
    <Card className="mb-6">
      <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
        <Sparkles className="h-5 w-5 text-red-800" /> Fulfillment-Generator
      </h2>
      <p className="mt-1 text-[13.5px] text-gray-600">
        Ein Klick erzeugt aus Onboarding und Kundenprofil alles für den Start. Danach: im Ads-Board prüfen (KI-Prüfung), Kunde gibt frei.
      </p>

      {d.fehlend.length > 0 && (
        <div className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-[13.5px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Im Briefing fehlt noch: <strong>{d.fehlend.join(', ')}</strong>. Ergänze es unten aus dem Gespräch – sonst bleiben die Texte allgemeiner.
          </span>
        </div>
      )}

      <ul className="mt-3 space-y-1.5">
        {d.teile.map((t) => {
          const s = gen?.teile?.[t.key];
          return (
            <li key={t.key} className="flex items-center gap-2 text-[14px]">
              <TeilStatus status={laeuft || gen ? s : undefined} />
              <span>{t.label}</span>
              {s?.startsWith('fehler') && <span className="text-[12.5px] text-red-700">– {s.replace(/^fehler: ?/, '')}</span>}
            </li>
          );
        })}
      </ul>

      {!laeuft && (
        <div className="mt-3 space-y-2">
          <textarea
            value={zusatz}
            onChange={(e) => setZusatz(e.target.value)}
            rows={2}
            placeholder="Infos aus Kick-off/Gespräch (optional): Verdienstbeispiele, Erfolgsgeschichten, was den Kunden besonders macht …"
            className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={starten} disabled={startet}>
              <Sparkles className="h-4 w-4" /> {startet ? 'Startet …' : gen ? 'Neu generieren' : 'Fulfillment-Paket generieren'}
            </Button>
            {gen?.status === 'fertig' && (
              <Link href={`/ads?kunde=${agencyId}`} className="text-[14px] font-semibold text-red-700 underline underline-offset-2">
                Ergebnisse im Ads-Board ansehen
              </Link>
            )}
          </div>
          {gen && <p className="text-[12.5px] text-gray-500">Neu generieren legt zusätzliche Ad-Karten an – vorhandene bleiben erhalten.</p>}
        </div>
      )}

      {f && (
        <details className="mt-4 border-t border-gray-100 pt-3" open>
          <summary className="cursor-pointer text-[15px] font-medium">Funnel-Texte</summary>
          <div className="mt-2 space-y-2 text-[14px] leading-relaxed text-gray-800">
            <p className="text-[18px] font-semibold leading-snug">{f.headline}</p>
            <p>{f.subheadline}</p>
            <ul className="list-disc pl-5">{f.vorteile.map((v, i) => <li key={i}>{v}</li>)}</ul>
            {f.quiz.map((q, i) => (
              <p key={i}>
                <strong className="font-semibold">Frage {i + 1}:</strong> {q.frage} <span className="text-gray-500">({q.antworten.join(' · ')})</span>
              </p>
            ))}
            <p><strong className="font-semibold">Formular:</strong> {f.formular_text}</p>
            <p><strong className="font-semibold">Danke-Seite:</strong> {f.danke_text}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => kopieren(f.perspective_prompt, 'Perspective-Prompt')}>
                <Copy className="h-4 w-4" /> Perspective-Prompt kopieren
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  kopieren(
                    [f.headline, f.subheadline, '', ...f.vorteile.map((v) => `• ${v}`), '', ...f.quiz.map((q, i) => `${i + 1}. ${q.frage}\n   ${q.antworten.join(' | ')}`), '', f.formular_text, '', f.danke_text].join('\n'),
                    'Funnel-Texte',
                  )
                }
              >
                <Copy className="h-4 w-4" /> Texte kopieren
              </Button>
            </div>
          </div>
        </details>
      )}

      {w && (
        <details className="mt-4 border-t border-gray-100 pt-3">
          <summary className="cursor-pointer text-[15px] font-medium">Webseiten-Video: {w.titel}</summary>
          <div className="mt-2 space-y-2 text-[14px] leading-relaxed text-gray-800">
            <p className="text-gray-600">{w.ziel} · ca. {w.laenge_sekunden} Sek. · Sprecher: {w.sprecher}</p>
            {w.szenen.map((s, i) => (
              <p key={i}>
                <strong className="font-semibold">[{s.sekunden} Sek.]</strong> {s.bild}
                <br />„{s.gesprochen}“{s.text_overlay ? <span className="text-gray-500"> · Text im Bild: {s.text_overlay}</span> : null}
              </p>
            ))}
            <p className="font-semibold">Drehanleitung</p>
            <ul className="list-disc pl-5">{w.drehanleitung.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                kopieren(
                  [w.titel, `${w.ziel} · ca. ${w.laenge_sekunden} Sek. · Sprecher: ${w.sprecher}`, '', ...w.szenen.map((s) => `[${s.sekunden} Sek.] ${s.bild}\n„${s.gesprochen}“${s.text_overlay ? `\nText im Bild: ${s.text_overlay}` : ''}`), '', 'Drehanleitung:', ...w.drehanleitung.map((x) => `• ${x}`)].join('\n'),
                  'Skript',
                )
              }
            >
              <Copy className="h-4 w-4" /> Skript kopieren
            </Button>
          </div>
        </details>
      )}
    </Card>
  );
}
