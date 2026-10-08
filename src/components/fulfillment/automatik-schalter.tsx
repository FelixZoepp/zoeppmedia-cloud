'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';

/** Schalter „Automatik (neue Fulfillment-Strecke)“ – sichtbar für Interne, schaltbar nur für Admins. */
export function AutomatikSchalter({ agencyId, onGeaendert }: { agencyId: string; onGeaendert?: () => void }) {
  const [stand, setStand] = useState<{ automatik: boolean; darfSchalten: boolean } | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    let aktiv = true;
    fetch(`/api/admin/agencies/${agencyId}/automatik`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (aktiv && d) setStand(d);
      })
      .catch(() => {});
    return () => {
      aktiv = false;
    };
  }, [agencyId]);

  if (!stand) return null;

  async function umschalten() {
    if (!stand) return;
    const neu = !stand.automatik;
    if (neu && !confirm('Automatik für diesen Kunden einschalten? Ab dann laufen Setup, Umfragen, Reports, Meta-Prüfung, Kampagnen-Anlage (pausiert), Funnel-Bau, KI-Bilder, Garantie und Kadenz automatisch.')) return;
    setLaeuft(true);
    const res = await fetch(`/api/admin/agencies/${agencyId}/automatik`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ automatik: neu }),
    });
    const data = await res.json().catch(() => ({}));
    setLaeuft(false);
    if (!res.ok) {
      toast.error(data.error || 'Umschalten fehlgeschlagen');
      return;
    }
    setStand({ ...stand, automatik: data.automatik });
    toast.success(data.automatik ? 'Automatik eingeschaltet' : 'Automatik ausgeschaltet');
    onGeaendert?.();
  }

  return (
    <Card padding="none" className="p-4 mb-4 flex items-center gap-3">
      <Zap className={`w-4 h-4 ${stand.automatik ? 'text-red-700' : 'text-gray-400'}`} />
      <div className="flex-1 text-sm">
        <p className="font-bold text-gray-900">Automatik (neue Fulfillment-Strecke)</p>
        <p className="text-gray-600">
          {stand.automatik
            ? 'An – Setup, Umfragen, Reports, Meta, Funnel, KI-Bilder, Garantie und Kadenz laufen automatisch.'
            : 'Aus – dieser Kunde läuft wie bisher von Hand. Knöpfe funktionieren trotzdem.'}
        </p>
      </div>
      {stand.darfSchalten && (
        <button
          disabled={laeuft}
          onClick={umschalten}
          className={`h-9 px-3 rounded-full text-sm font-semibold disabled:opacity-50 ${
            stand.automatik ? 'border border-gray-300 text-gray-700' : 'bg-gradient-to-b from-red-700 to-red-950 text-white'
          }`}
        >
          {laeuft ? '…' : stand.automatik ? 'Ausschalten' : 'Einschalten'}
        </button>
      )}
    </Card>
  );
}
