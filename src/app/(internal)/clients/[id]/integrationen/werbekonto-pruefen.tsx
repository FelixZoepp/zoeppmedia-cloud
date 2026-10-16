'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PruefErgebnis, Werbekonto } from '@/lib/meta/kampagnen-kosten';

type Gefunden = Werbekonto & { kunde: { id: string; name: string; dieser: boolean } | null };

/** Werbekonto prüfen (Name, Währung, Status) bzw. alle zugänglichen Konten auflisten – übernommen wird erst per Klick + Speichern */
export function WerbekontoPruefen({ agencyId, wert, onWaehlen }: { agencyId: string; wert: string; onWaehlen: (id: string) => void }) {
  const [ergebnis, setErgebnis] = useState<PruefErgebnis | null>(null);
  const [konten, setKonten] = useState<Gefunden[] | null>(null);
  const [busy, setBusy] = useState<'pruefen' | 'finden' | null>(null);

  async function pruefen() {
    setBusy('pruefen');
    try {
      const r = await fetch(`/api/admin/agencies/${agencyId}/werbekonto?pruefen=${encodeURIComponent(wert)}`, { cache: 'no-store' });
      setErgebnis(r.ok ? await r.json() : { ok: false, art: 'fehler', meldung: 'Prüfung fehlgeschlagen' });
    } finally {
      setBusy(null);
    }
  }

  async function finden() {
    setBusy('finden');
    try {
      const r = await fetch(`/api/admin/agencies/${agencyId}/werbekonto?finden=1`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) toast.error(j.error ?? 'Werbekonten konnten nicht geladen werden');
      else setKonten(j.konten as Gefunden[]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" disabled={!wert.trim() || busy !== null} onClick={() => void pruefen()}>
          {busy === 'pruefen' ? 'Prüft …' : 'Prüfen'}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void finden()}>
          {busy === 'finden' ? 'Sucht …' : 'Werbekonten finden'}
        </Button>
      </div>

      {ergebnis &&
        (ergebnis.ok ? (
          <p className="text-xs text-green-700">
            ✓ {ergebnis.konto.name ?? ergebnis.konto.id} · {ergebnis.konto.waehrung ?? '–'} · {ergebnis.konto.status}
            {ergebnis.konto.business ? ` · ${ergebnis.konto.business}` : ''}
          </p>
        ) : (
          <p className="text-xs text-red-600">{ergebnis.meldung}</p>
        ))}

      {konten && (
        <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
          {konten.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">Keine Werbekonten zugänglich.</p>}
          {konten.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-gray-900">{k.name ?? k.id}</span>
                <span className="text-[11px] text-gray-500">
                  {k.id} · {k.waehrung ?? '–'} · {k.status}
                  {k.kunde && ` · ${k.kunde.dieser ? 'dieser Kunde' : `bei ${k.kunde.name}`}`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {!k.aktiv && <Badge tone="warning">{k.status}</Badge>}
                <button className="text-xs font-medium text-red-600 hover:underline" onClick={() => { onWaehlen(k.id); setErgebnis(null); }}>
                  Übernehmen
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Kein Zugriff? Der Kunde fügt im Meta Business Manager unter Unternehmenseinstellungen → Partner das Zoepp-Business hinzu
        und gibt das Werbekonto frei (mindestens „Leistung ansehen“). Danach dem Zoepp-Systembenutzer das Werbekonto zuweisen und hier erneut prüfen.
      </p>
    </div>
  );
}
