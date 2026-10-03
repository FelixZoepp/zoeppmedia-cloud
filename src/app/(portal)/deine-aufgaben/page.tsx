'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Copy, FileDown, Clock, MessageSquare, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { AssetPreview } from '@/components/ads/asset-preview';
import { PageHeader } from '@/components/ui/page-header';
import { META_PARTNER_ID, META_CHECKLISTE_PDF, phaseLabel, type Phase } from '@/lib/fulfillment/catalog';
import type { StepView } from '@/lib/fulfillment/views';

interface Aufgaben {
  phase: Phase;
  offen: StepView[];
  in_pruefung: StepView[];
  erledigt: StepView[];
}

function fristText(d: string | null): string | null {
  if (!d) return null;
  return `bis ${new Date(`${d}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}`;
}

function AufgabeCard({ step, onDone }: { step: StepView; onDone: (kommentar?: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isMeta = step.step_key.startsWith('o_meta_');

  return (
    <Card padding="none" className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">{step.titel}</p>
          {step.beschreibung && <p className="text-sm text-gray-600 mt-0.5">{step.beschreibung}</p>}
          <div className="flex items-center gap-3 mt-1.5 text-xs">
            {fristText(step.faellig_am) && (
              <span className={`inline-flex items-center gap-1 ${step.ueberfaellig ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                <Clock className="w-3 h-3" /> {fristText(step.faellig_am)}
              </span>
            )}
            {step.anleitung && (
              <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-red-600 font-medium">
                So geht&apos;s <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        </div>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onDone();
            } finally {
              setBusy(false);
            }
          }}
          className="h-9 px-3.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60 flex-shrink-0"
        >
          Erledigt
        </button>
      </div>

      {step.kommentar && (
        <div className="mt-3 text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2 flex items-start gap-2">
          <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            <strong>Hinweis vom Team:</strong> {step.kommentar}
          </span>
        </div>
      )}

      {open && step.anleitung && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
          <ol className="list-decimal pl-5 space-y-1.5 text-gray-700">
            {step.anleitung.schritte.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
          {isMeta && (
            <a href={META_CHECKLISTE_PDF} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-red-600">
              <FileDown className="w-3.5 h-3.5" /> Anleitung mit Screenshots (PDF{step.anleitung.pdf_seiten ? `, ${step.anleitung.pdf_seiten}` : ''})
            </a>
          )}
        </div>
      )}
    </Card>
  );
}


interface FreigabeAd {
  id: string;
  titel: string;
  idee: string | null;
  typ: string;
  vorschau_url: string | null;
}

function FreigabeCard({ ad, onDecide }: { ad: FreigabeAd; onDecide: (aktion: 'freigeben' | 'aendern', kommentar?: string) => Promise<void> }) {
  const [aendern, setAendern] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (aktion: 'freigeben' | 'aendern') => {
    setBusy(true);
    try {
      await onDecide(aktion, text);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card padding="none" className="p-4">
      <p className="font-semibold text-gray-900">{ad.titel}</p>
      {ad.idee && <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-line">{ad.idee}</p>}
      {ad.vorschau_url && (
        <div className="mt-3">
          <AssetPreview url={ad.vorschau_url} titel={ad.titel} />
        </div>
      )}
      {aendern ? (
        <div className="mt-3 space-y-2">
          <textarea
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[80px]"
            placeholder="Was sollen wir ändern?"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex gap-2">
            <button disabled={busy || !text.trim()} onClick={() => run('aendern')} className="h-9 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">
              Änderung schicken
            </button>
            <button onClick={() => setAendern(false)} className="h-9 px-4 rounded-lg border border-gray-300 bg-white text-sm">Abbrechen</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button disabled={busy} onClick={() => run('freigeben')} className="h-9 px-4 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
            Freigeben
          </button>
          <button onClick={() => setAendern(true)} className="h-9 px-4 rounded-lg border border-gray-300 bg-white text-sm hover:bg-gray-50">
            Änderung wünschen
          </button>
        </div>
      )}
    </Card>
  );
}

export default function DeineAufgabenPage() {
  const [data, setData] = useState<Aufgaben | null>(null);
  const [freigaben, setFreigaben] = useState<FreigabeAd[]>([]);

  const load = () =>
    Promise.all([
      fetch('/api/deine-aufgaben').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/deine-freigaben').then((r) => (r.ok ? r.json() : { ads: [] })),
    ]).then(([d, f]) => {
      if (d) setData(d);
      setFreigaben(f.ads ?? []);
    });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/deine-aufgaben').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/deine-freigaben').then((r) => (r.ok ? r.json() : { ads: [] })),
    ]).then(([d, f]) => {
      if (cancelled) return;
      if (d) setData(d);
      setFreigaben(f.ads ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const done = async (id: string, kommentar?: string) => {
    const res = await fetch(`/api/deine-aufgaben/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kommentar }),
    });
    if (!res.ok) {
      toast.error('Konnte nicht gespeichert werden');
      return;
    }
    const { status } = (await res.json()) as { status: string };
    toast.success(status === 'zur_pruefung' ? 'Danke! Wir prüfen das kurz.' : 'Danke, erledigt!');
    await load();
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  const hatMeta = data.offen.some((s) => s.step_key.startsWith('o_meta_'));

  return (
    <div className="max-w-3xl">
      <PageHeader label={`PHASE: ${phaseLabel(data.phase).toUpperCase()}`} title="Deine Aufgaben" counter={`${data.offen.length + freigaben.length} offen`} />

      {freigaben.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ads zur Freigabe ({freigaben.length})</p>
          <div className="space-y-3">
            {freigaben.map((ad) => (
              <FreigabeCard
                key={ad.id}
                ad={ad}
                onDecide={async (aktion, kommentar) => {
                  const res = await fetch(`/api/deine-freigaben/${ad.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ aktion, kommentar }),
                  });
                  if (!res.ok) {
                    toast.error((await res.json()).error ?? 'Konnte nicht gespeichert werden');
                    return;
                  }
                  toast.success(aktion === 'freigeben' ? 'Danke, freigegeben!' : 'Danke, wir passen das an.');
                  await load();
                }}
              />
            ))}
          </div>
        </div>
      )}

      {hatMeta && (
        <Card padding="none" className="p-4 mb-4 border-red-200 bg-red-50/40">
          <p className="text-sm text-gray-800">
            <strong>Wichtig für alle Meta-Zugänge:</strong> Alle Einladungen bitte als <strong>Partner</strong> an diese Unternehmens-ID schicken:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="text-lg font-bold tracking-wide text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-1">{META_PARTNER_ID}</code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(META_PARTNER_ID);
                toast.success('ID kopiert');
              }}
              className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm inline-flex items-center gap-1.5 hover:bg-gray-50"
            >
              <Copy className="w-4 h-4" /> Kopieren
            </button>
            <a href={META_CHECKLISTE_PDF} target="_blank" rel="noreferrer" className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm inline-flex items-center gap-1.5 hover:bg-gray-50">
              <FileDown className="w-4 h-4" /> Komplette Anleitung (PDF)
            </a>
          </div>
        </Card>
      )}

      {!data.offen.length && !freigaben.length && (
        <Card padding="lg" className="text-center mb-4">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">Gerade gibt es nichts zu tun. Wir melden uns, sobald wir etwas von dir brauchen.</p>
        </Card>
      )}

      <div className="space-y-3">
        {data.offen.map((s) => (
          <AufgabeCard key={s.id} step={s} onDone={(k) => done(s.id, k)} />
        ))}
      </div>

      {data.in_pruefung.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Wir prüfen gerade</p>
          <div className="space-y-1.5">
            {data.in_pruefung.map((s) => (
              <p key={s.id} className="text-sm text-gray-600 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" /> {s.titel}
              </p>
            ))}
          </div>
        </div>
      )}

      {data.erledigt.length > 0 && (
        <details className="mt-6">
          <summary className="text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer">Erledigt ({data.erledigt.length})</summary>
          <div className="space-y-1.5 mt-2">
            {data.erledigt.map((s) => (
              <p key={s.id} className="text-sm text-gray-500 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" /> {s.titel}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
