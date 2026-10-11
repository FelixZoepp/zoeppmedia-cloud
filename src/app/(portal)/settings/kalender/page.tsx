'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarCheck, CalendarX, Loader2 } from 'lucide-react';
import { Button, Card, PageHeader } from '@/components/ui';

interface Status {
  verbindung: { provider: 'google' | 'microsoft'; konto_email: string | null; fehler: string | null; created_at: string } | null;
  google: boolean;
  microsoft: boolean;
}

const NAME = { google: 'Google Kalender', microsoft: 'Outlook / Microsoft 365' };

export default function KalenderSeite() {
  const [s, setS] = useState<Status | null>(null);
  const laden = useCallback(async () => {
    const r = await fetch('/api/kalender/status', { cache: 'no-store' });
    if (r.ok) setS(await r.json());
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void laden();
      const q = new URLSearchParams(window.location.search);
      if (q.get('verbunden')) toast.success('Kalender verbunden – Termine landen ab jetzt direkt in deinem Kalender');
      const f = q.get('fehler');
      if (f) toast.error(f === 'abgelaufen' ? 'Anmeldung abgelaufen – bitte erneut verbinden' : `Verbindung fehlgeschlagen: ${f}`);
    }, 0);
    return () => clearTimeout(t);
  }, [laden]);

  const trennen = async () => {
    if (!confirm('Kalender wirklich trennen? Neue Termine werden dann nicht mehr automatisch eingetragen.')) return;
    const r = await fetch('/api/kalender/status', { method: 'DELETE' });
    if (!r.ok) return toast.error('Trennen fehlgeschlagen');
    toast.success('Kalender getrennt');
    void laden();
  };

  if (!s) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-red-700" />
      </div>
    );
  }
  const v = s.verbindung;
  return (
    <div className="max-w-2xl">
      <PageHeader label="EINSTELLUNGEN" title="Kalender" description="Verbinde deinen Kalender: Wir sehen deine freien Zeiten und tragen Vorstellungsgespräche und Probetage direkt bei dir ein." />
      <Card>
        {v ? (
          <div className="flex flex-wrap items-start gap-3">
            <CalendarCheck className="h-6 w-6 flex-none text-green-700" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium">{NAME[v.provider]} verbunden</p>
              <p className="text-[13.5px] text-gray-600">{v.konto_email ?? ''} · seit {new Date(v.created_at).toLocaleDateString('de-DE')}</p>
              {v.fehler && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[13px] text-amber-800">Zugriff gestört: {v.fehler} – bitte erneut verbinden.</p>}
            </div>
            <Button variant="ghost" onClick={trennen}>
              <CalendarX className="h-4 w-4" /> Trennen
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-[15px] font-medium">Noch kein Kalender verbunden</p>
            <p className="mt-1 text-[13.5px] text-gray-600">Ein Klick, dann bei Google oder Microsoft anmelden und zustimmen – fertig. Wir lesen nur, wann du belegt bist, und tragen Bewerbertermine ein.</p>
          </div>
        )}
        {(!v || v.fehler) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {s.google && (
              <a href="/api/kalender/verbinden?provider=google" className="inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-b from-red-700 to-red-950 px-5 text-[15px] font-medium text-white">
                Mit Google Kalender verbinden
              </a>
            )}
            {s.microsoft && (
              <a href="/api/kalender/verbinden?provider=microsoft" className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-medium text-gray-900 shadow-[inset_0_0_0_1.5px_var(--hair)]">
                Mit Outlook / Microsoft 365 verbinden
              </a>
            )}
            {!s.google && !s.microsoft && <p className="text-[13px] text-amber-700">Die Kalender-Anbindung wird gerade von Zoepp Media eingerichtet.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
