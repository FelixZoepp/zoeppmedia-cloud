'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileCheck2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface VertragStand {
  status: 'offen' | 'bestaetigt';
  unterzeichner_name: string | null;
  bestaetigt_am: string | null;
  setup_rechnung_nummer: string | null;
  setup_rechnung_status: string | null;
  setup_bezahlt_am: string | null;
}

const STATUS: Record<string, string> = { open: 'offen', paid: 'bezahlt', paidoff: 'bezahlt', voided: 'storniert' };
const datum = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });

/** Vertrag + Setup-Rechnung (nur Kunden aus dem neuen Ablauf). Rechnungsnummer von Hand verknüpfen, falls die Automatik nichts findet. */
export function SetupRechnungKarte({ agencyId, onGeaendert }: { agencyId: string; onGeaendert?: () => void }) {
  const [stand, setStand] = useState<VertragStand | null>(null);
  const [nummer, setNummer] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let aktiv = true;
    fetch(`/api/admin/agencies/${agencyId}/setup-rechnung`)
      .then((r) => (r.ok ? r.json() : { vertrag: null }))
      .then((d: { vertrag: VertragStand | null }) => {
        if (aktiv) setStand(d.vertrag);
      })
      .catch(() => {});
    return () => {
      aktiv = false;
    };
  }, [agencyId, version]);

  if (!stand) return null;

  async function verknuepfen() {
    setLaeuft(true);
    const res = await fetch(`/api/admin/agencies/${agencyId}/setup-rechnung`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nummer }),
    });
    const data = await res.json().catch(() => ({}));
    setLaeuft(false);
    if (!res.ok) {
      toast.error(data.error || 'Verknüpfen fehlgeschlagen');
      return;
    }
    toast.success(data.bezahlt ? 'Rechnung verknüpft – bezahlt, Onboarding gestartet' : `Rechnung verknüpft (${STATUS[data.status] ?? data.status})`);
    setNummer('');
    setVersion((v) => v + 1);
    onGeaendert?.();
  }

  return (
    <Card padding="none" className="p-4 mb-4">
      <p className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-1.5">
        <FileCheck2 className="w-4 h-4" /> Vertrag &amp; Setup-Rechnung
      </p>
      <div className="text-sm text-gray-700 space-y-0.5">
        <p>
          Vertrag:{' '}
          {stand.status === 'bestaetigt' && stand.bestaetigt_am
            ? `bestätigt von ${stand.unterzeichner_name ?? '–'} am ${datum(stand.bestaetigt_am)}`
            : 'wartet auf Bestätigung durch den Kunden'}
        </p>
        <p>
          Setup-Rechnung:{' '}
          {stand.setup_rechnung_nummer
            ? `${stand.setup_rechnung_nummer} – ${stand.setup_bezahlt_am ? `bezahlt am ${datum(stand.setup_bezahlt_am)}` : STATUS[stand.setup_rechnung_status ?? ''] ?? 'offen'}`
            : stand.status === 'bestaetigt'
              ? 'noch nicht in Lexware gefunden (die Cloud sucht alle 15 Minuten)'
              : '–'}
        </p>
      </div>
      {stand.status === 'bestaetigt' && !stand.setup_bezahlt_am && (
        <div className="flex flex-wrap gap-2 mt-3">
          <input
            className="h-9 flex-1 min-w-[180px] rounded-lg border border-gray-300 px-2.5 text-sm"
            placeholder="Lexware-Rechnungsnummer, z.B. RE0042"
            value={nummer}
            onChange={(e) => setNummer(e.target.value)}
          />
          <button
            disabled={!nummer.trim() || laeuft}
            onClick={verknuepfen}
            className="h-9 px-3 rounded-full bg-gradient-to-b from-red-700 to-red-950 text-white text-sm font-semibold disabled:opacity-50"
          >
            {laeuft ? 'Prüfe …' : 'Rechnung verknüpfen'}
          </button>
        </div>
      )}
    </Card>
  );
}
