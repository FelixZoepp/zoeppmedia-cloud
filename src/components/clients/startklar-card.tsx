'use client';

import { useCallback, useEffect, useState } from 'react';
import { Rocket, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card } from '@/components/ui';
import { StartklarListe } from '@/components/startklar/startklar-liste';
import type { Startklar } from '@/lib/startklar/schritte';

interface Daten {
  startklar: Startklar;
  kontakt: { global: boolean; kunde: boolean; darfSchalten: boolean };
}

/** Kundenakte: Startklar-Stand des Kunden + Bewerber-Kontakt für genau diesen Kunden freigeben */
export function StartklarCard({ agencyId }: { agencyId: string }) {
  const [d, setD] = useState<Daten | null>(null);
  const [speichert, setSpeichert] = useState(false);

  const laden = useCallback(async () => {
    const res = await fetch(`/api/admin/agencies/${agencyId}/startklar`, { cache: 'no-store' });
    if (res.ok) setD(await res.json());
  }, [agencyId]);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function kontaktSchalten(an: boolean) {
    if (an && !confirm('Bewerber-Kontakt für diesen Kunden freigeben? Ab jetzt schreibt der KI-Agent neue Bewerber dieses Kunden automatisch an.')) return;
    setSpeichert(true);
    const res = await fetch('/api/admin/bewerber-kontakt', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kunde: { id: agencyId, an } }),
    });
    const j = await res.json().catch(() => ({}));
    setSpeichert(false);
    if (!res.ok) return void toast.error(j.error ?? 'Fehler');
    toast.success(an ? 'Bewerber-Kontakt freigegeben' : 'Bewerber-Kontakt gesperrt');
    void laden();
  }

  if (!d) return null;
  const { startklar, kontakt } = d;
  const frei = kontakt.global || kontakt.kunde;
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
          <Rocket className="h-5 w-5 text-red-800" /> Startklar
        </h2>
        {startklar.fertig ? <Badge tone="success">Alles erledigt</Badge> : <Badge tone="warning">{startklar.prozent} %</Badge>}
      </div>
      <p className="mb-4 mt-1 text-[13.5px] text-gray-600">
        Was der Kunde in seiner Cloud schon eingerichtet hat – erkennt sich von selbst. Logins und Einladungen:{' '}
        <a href="#kunden-logins" className="font-medium text-red-700 underline-offset-2 hover:underline">
          Kunden-Logins
        </a>
        .
      </p>
      <StartklarListe startklar={startklar} mitLinks={false} />

      <div className={`mt-5 flex flex-wrap items-start gap-3 rounded-xl p-4 ${frei ? 'bg-panel' : 'border border-amber-200 bg-amber-50/40'}`}>
        {frei ? <ShieldCheck className="h-5 w-5 flex-none text-green-700" /> : <ShieldAlert className="h-5 w-5 flex-none text-amber-700" />}
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-medium">Bewerber-Kontakt für diesen Kunden {frei ? 'freigegeben' : 'gesperrt'}</p>
          <p className="text-[13px] text-gray-600">
            {kontakt.global
              ? 'Global für alle Kunden freigegeben (Admin → Anbindung).'
              : frei
                ? 'KI-Agent und Automatiken schreiben die Bewerber dieses Kunden an.'
                : 'Kein Bewerber dieses Kunden wird automatisch angeschrieben (außer Testnummern).'}
            {!kontakt.darfSchalten && ' Schalten können nur Admins.'}
          </p>
        </div>
        {!kontakt.global && kontakt.darfSchalten && (
          <Button size="sm" variant={kontakt.kunde ? 'secondary' : 'primary'} disabled={speichert} onClick={() => void kontaktSchalten(!kontakt.kunde)}>
            {kontakt.kunde ? 'Wieder sperren' : 'Freigeben'}
          </Button>
        )}
      </div>
    </Card>
  );
}
