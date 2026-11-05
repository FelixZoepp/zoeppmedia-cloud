'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bot, Check, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Stand {
  status: 'angefragt' | 'eingerichtet' | 'aktiv' | 'pausiert' | null;
  angefragt_am: string | null;
}
interface Zahlen {
  gesamt: number;
  erreichbarkeit: number | null;
  speedToLeadSek: number | null;
}

const tag = (d: Date) => d.toISOString().slice(0, 10);

function dauer(sek: number): string {
  if (sek < 3600) return `${Math.max(1, Math.round(sek / 60))} Min.`;
  if (sek < 86400) return `${(sek / 3600).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Std.`;
  return `${(sek / 86400).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Tage`;
}

/**
 * Upsell im Kundenportal: Hiring Lisa anfragen (keine Preise, keine Buchung).
 * Ein Klick = Anfrage → Aufgabe für das Zoepp-Team, das Paket wird im Gespräch besprochen.
 */
export function LisaAnfrageKarte() {
  const [stand, setStand] = useState<Stand | null>(null);
  const [zahlen, setZahlen] = useState<Zahlen | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    let ab = true;
    fetch('/api/lisa', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => ab && setStand(d ?? { status: null, angefragt_am: null }))
      .catch(() => ab && setStand({ status: null, angefragt_am: null }));
    const bis = new Date();
    const von = new Date(bis.getTime() - 29 * 864e5);
    fetch(`/api/recruiting-stats/anrufe?from=${tag(von)}&to=${tag(bis)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => ab && d && setZahlen(d))
      .catch(() => {});
    return () => {
      ab = false;
    };
  }, []);

  async function anfragen() {
    setLaeuft(true);
    const r = await fetch('/api/lisa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const d = await r.json().catch(() => ({}));
    setLaeuft(false);
    if (!r.ok) return toast.error(d.error ?? 'Anfrage fehlgeschlagen');
    setStand({ status: d.status ?? 'angefragt', angefragt_am: new Date().toISOString() });
    toast.success('Danke! Wir melden uns bei dir und besprechen Hiring Lisa mit dir.');
  }

  // Schon aktiv → keine Werbung zeigen
  if (!stand || stand.status === 'aktiv' || stand.status === 'pausiert' || stand.status === 'eingerichtet') return null;
  const angefragt = stand.status === 'angefragt';

  return (
    <Card padding="lg" className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-red-50 text-red-800">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Hiring Lisa – jeder Bewerber in 60 Sekunden angerufen</h2>
            <p className="mt-1 max-w-[62ch] text-[13px] text-gray-600">
              Lisa ruft neue Bewerber rund um die Uhr innerhalb einer Minute an, fragt die wichtigsten Punkte ab und legt den Termin direkt in den
              Kalender deiner Führungskraft. Anrufe, Ergebnisse und Termine siehst du hier in der Cloud beim Bewerber.
            </p>
            {zahlen && zahlen.gesamt > 0 && (
              <p className="mt-2 text-[13px] text-gray-800">
                Bei dir in den letzten 30 Tagen:
                {zahlen.speedToLeadSek != null && (
                  <>
                    {' '}
                    Ø <strong>{dauer(zahlen.speedToLeadSek)}</strong> bis zum ersten Kontakt
                  </>
                )}
                {zahlen.erreichbarkeit != null && (
                  <>
                    {zahlen.speedToLeadSek != null ? ' · ' : ' '}
                    <strong>{Math.round(zahlen.erreichbarkeit * 100)} %</strong> der Anrufe erreichen jemanden
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        {angefragt ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-[13px] font-medium text-green-800">
            <Check className="h-4 w-4" /> Angefragt – wir melden uns
          </span>
        ) : (
          <Button onClick={() => void anfragen()} disabled={laeuft}>
            {laeuft ? <Loader2 className="animate-spin" /> : <Bot />} Hiring Lisa anfragen
          </Button>
        )}
      </div>
    </Card>
  );
}
