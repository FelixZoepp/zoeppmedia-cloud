'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import type { MarketingFeedback } from '@/lib/gespraeche/marketing';

interface Row {
  von: string;
  bis: string;
  gespraeche: number;
  inhalt: MarketingFeedback;
  created_at: string;
}

const datum = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

/** Einwände & Fragen der Woche → Ideen fürs Marketing (montags automatisch, auf Knopfdruck neu) */
export function MarketingFeedbackKarte() {
  const [f, setF] = useState<Row | null | undefined>(undefined);
  const [laeuft, setLaeuft] = useState(false);

  const laden = useCallback(async () => {
    const r = await fetch('/api/admin/marketing-feedback', { cache: 'no-store' });
    setF(r.ok ? ((await r.json()).feedback as Row | null) : null);
  }, []);
  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function neu() {
    setLaeuft(true);
    const r = await fetch('/api/admin/marketing-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tage: 7 }) });
    const d = await r.json().catch(() => ({}));
    setLaeuft(false);
    if (!r.ok) return void toast.error(d.error ?? 'Fehlgeschlagen');
    toast.success('Marketing-Feedback aktualisiert');
    void laden();
  }

  if (f === undefined) return null;
  const x = f?.inhalt;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-[17px] font-medium">
            <Megaphone className="h-4 w-4 text-red-800" /> Marketing-Feedback der Woche
          </h3>
          <p className="mt-0.5 text-[13px] text-gray-600">
            {f ? `Einwände & Fragen aus ${f.gespraeche} Gesprächen (${datum(f.von)}–${datum(f.bis)}) – kommt jeden Montag neu.` : 'Wird montags aus den Einwänden und Fragen der Gespräche erstellt.'}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={neu} disabled={laeuft}>
          <RefreshCw className={`h-4 w-4 ${laeuft ? 'animate-spin' : ''}`} /> {laeuft ? 'Erstellt …' : 'Jetzt erstellen'}
        </Button>
      </div>
      {x && (
        <div className="mt-3 space-y-3 text-[14px]">
          <p className="text-gray-800">{x.zusammenfassung}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Top-Einwände</p>
              <ul className="mt-1 space-y-2">
                {x.einwaende.map((e, i) => (
                  <li key={i}>
                    <p className="font-medium">{e.thema} <span className="text-gray-500">· {e.anzahl}×</span></p>
                    {e.beispiele[0] && <p className="text-[13px] italic text-gray-600">„{e.beispiele[0]}“</p>}
                    <p className="text-[13px] text-green-800">Im Marketing: {e.antwort_im_marketing}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              {x.fragen.length > 0 && (
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Häufige Fragen</p>
                  <ul className="mt-1 space-y-0.5">{x.fragen.map((q, i) => <li key={i}>• {q.frage} <span className="text-gray-500">({q.anzahl}×)</span></li>)}</ul>
                </div>
              )}
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Ideen</p>
                <ul className="mt-1 space-y-0.5">
                  {x.ideen.ad_winkel.map((v, i) => <li key={`a${i}`}>• <strong className="font-medium">Ad:</strong> {v}</li>)}
                  {x.ideen.funnel_faq.map((v, i) => <li key={`f${i}`}>• <strong className="font-medium">Funnel-FAQ:</strong> {v}</li>)}
                  {x.ideen.content.map((v, i) => <li key={`c${i}`}>• <strong className="font-medium">Content:</strong> {v}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
