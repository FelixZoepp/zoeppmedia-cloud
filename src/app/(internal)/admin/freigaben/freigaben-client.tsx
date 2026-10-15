'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, PageHeader } from '@/components/ui';

interface Freigabe {
  titel: string;
  was: string;
  wirkt: string;
}

const ANSEHEN: Record<string, { href: string; label: string }> = {
  protokoll_aufgaben: { href: '/admin/briefing?live=1', label: 'Fehlende Protokolle im Briefing' },
  closing_ergebnisse: { href: '/admin/vertrieb', label: 'Sales-Controlling' },
  angebot_nachfassen: { href: '/admin/vertrieb', label: 'Sales-Controlling' },
  empfehlung_aufgaben: { href: '/admin/empfehlungen', label: 'Kandidaten ansehen' },
  kontrollzentrum_warnungen: { href: '/admin/kontrollzentrum', label: 'Kontrollzentrum' },
};

export function FreigabenClient() {
  const [d, setD] = useState<{ freigaben: Record<string, Freigabe>; an: Record<string, boolean> } | null>(null);

  const laden = useCallback(async () => {
    const r = await fetch('/api/admin/freigaben', { cache: 'no-store' });
    if (r.ok) setD(await r.json());
  }, []);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  const schalten = async (key: string, an: boolean) => {
    if (an && !window.confirm(`„${d?.freigaben[key].titel}“ einschalten?\n\n${d?.freigaben[key].was}`)) return;
    const r = await fetch('/api/admin/freigaben', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, an }) });
    if (r.ok) toast.success(an ? 'Eingeschaltet' : 'Ausgeschaltet');
    else toast.error('Nicht gespeichert');
    await laden();
  };

  return (
    <div className="space-y-5">
      <PageHeader label="ADMIN" title="Freigaben" description="Neue Automatiken sind aus, bis du sie hier einschaltest. Regel: Keine Automatik schreibt Kunden, Leads oder Bewerbern." />
      <Card padding="none" className="bg-green-50 p-4 text-sm text-green-800">
        ✅ Ohne Freigabe live (reine Auswertung, keine Außenwirkung): <Link href="/admin/anzeigen" className="underline">Anzeigen-Auswertung</Link> ·{' '}
        <Link href="/admin/empfehlungen" className="underline">Empfehlungs-Kandidaten</Link> · fehlende Protokolle und Anzeigen-Alarme im <Link href="/admin/briefing" className="underline">CEO-Briefing</Link>.
      </Card>
      {d &&
        Object.entries(d.freigaben).map(([key, f]) => {
          const an = d.an[key];
          return (
            <Card key={key} padding="none" className="space-y-2 p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{f.titel}</p>
                  <p className="mt-1 text-sm text-gray-700">{f.was}</p>
                  <p className="mt-1 text-xs text-gray-500">Wirkt auf: {f.wirkt}</p>
                  {ANSEHEN[key] && <Link href={ANSEHEN[key].href} className="mt-1 inline-block text-xs font-semibold text-red-600 underline">{ANSEHEN[key].label}</Link>}
                </div>
                <button
                  onClick={() => schalten(key, !an)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${an ? 'bg-green-600' : 'bg-gray-300'}`}
                  aria-label={an ? 'Ausschalten' : 'Einschalten'}
                >
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${an ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
              <p className={`text-xs font-semibold ${an ? 'text-green-700' : 'text-gray-400'}`}>{an ? '● Eingeschaltet' : '○ Aus – wartet auf deine Freigabe'}</p>
            </Card>
          );
        })}
      <Card padding="none" className="p-4 text-sm text-gray-600">
        Weitere Schalter: <Link href="/admin/anbindung" className="underline">Bewerber-Kontakt (Indeed-/WhatsApp-Bot)</Link> · Mahnwesen-Stichtag unter{' '}
        <Link href="/buchhaltung?tab=mahnwesen" className="underline">Buchhaltung</Link>.
      </Card>
    </div>
  );
}
