'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, HelpCircle, ShieldCheck, Rocket, Megaphone } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface ZugangErgebnis {
  step_key: string;
  label: string;
  status: 'ok' | 'fehlt' | 'unbekannt';
  hinweis: string;
}

interface Stand {
  kampagne: { campaign_id: string | null; status: 'angelegt' | 'aktiv' | 'fehler'; fehler: string | null; tagesbudget: number | null; ziel: string | null } | null;
  voraussetzungen: { bereit: boolean; fehlt: string[] };
  autostart: boolean;
  ads: Array<{ id: string; titel: string; stage: string; meta_ad_id: string | null; meta_fehler: string | null }>;
}

const ICON = { ok: CheckCircle2, fehlt: AlertCircle, unbekannt: HelpCircle };
const FARBE = { ok: 'text-green-600', fehlt: 'text-red-600', unbekannt: 'text-gray-400' };

/** Meta-Automatik im Kunden-Ablauf: Zugänge per API prüfen, Kampagne pausiert anlegen, bewusst starten */
export function MetaAutomatikKarte({ agencyId, onChanged }: { agencyId: string; onChanged?: () => void }) {
  const [zugaenge, setZugaenge] = useState<{ geprueft_am: string; ergebnisse: ZugangErgebnis[] } | null>(null);
  const [stand, setStand] = useState<Stand | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const [z, k] = await Promise.all([
      fetch(`/api/admin/agencies/${agencyId}/meta-zugaenge`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/admin/agencies/${agencyId}/meta-kampagne`).then((r) => (r.ok ? r.json() : null)),
    ]);
    setZugaenge(z?.pruefung ?? null);
    setStand(k);
  }, [agencyId]);

  useEffect(() => {
    let abgebrochen = false;
    Promise.all([
      fetch(`/api/admin/agencies/${agencyId}/meta-zugaenge`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/admin/agencies/${agencyId}/meta-kampagne`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([z, k]) => {
      if (abgebrochen) return;
      setZugaenge(z?.pruefung ?? null);
      setStand(k);
    });
    return () => {
      abgebrochen = true;
    };
  }, [agencyId]);

  const aktion = async (name: string, url: string, body?: Record<string, unknown>) => {
    setLaeuft(name);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error || data.fehler) toast.error(data.error ?? data.fehler ?? 'Fehlgeschlagen');
      else if (data.fehlt?.length) toast.warning(`Noch nicht möglich: ${data.fehlt.join(' · ')}`);
      else toast.success('Erledigt');
      await laden();
      onChanged?.();
    } finally {
      setLaeuft(null);
    }
  };

  const k = stand?.kampagne;
  const angelegt = (stand?.ads ?? []).filter((a) => a.meta_ad_id).length;

  return (
    <Card padding="none" className="p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Megaphone className="w-4 h-4" /> Meta-Automatik
        </p>
        <button
          disabled={!!laeuft}
          onClick={() => aktion('zugaenge', `/api/admin/agencies/${agencyId}/meta-zugaenge`)}
          className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs inline-flex items-center gap-1.5 hover:bg-gray-50 disabled:opacity-50"
        >
          <ShieldCheck className="w-3.5 h-3.5" /> {laeuft === 'zugaenge' ? 'Prüfe …' : 'Zugänge prüfen'}
        </button>
      </div>

      {zugaenge ? (
        <div className="space-y-1 mb-3">
          {zugaenge.ergebnisse.map((e) => {
            const Icon = ICON[e.status];
            return (
              <div key={e.step_key} className="flex gap-2 text-xs">
                <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${FARBE[e.status]}`} />
                <span className="font-semibold w-28 shrink-0">{e.label}</span>
                <span className="text-gray-600">{e.hinweis}</span>
              </div>
            );
          })}
          <p className="text-[11px] text-gray-400">Geprüft {new Date(zugaenge.geprueft_am).toLocaleString('de-DE')}</p>
        </div>
      ) : (
        <p className="text-xs text-gray-500 mb-3">Noch nicht geprüft.</p>
      )}

      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs text-gray-700 mb-2">
          Kampagne:{' '}
          <strong>
            {!k?.campaign_id ? 'noch nicht angelegt' : k.status === 'aktiv' ? 'läuft' : k.status === 'fehler' ? 'Fehler' : 'angelegt (pausiert)'}
          </strong>
          {k?.tagesbudget ? ` · ${Number(k.tagesbudget).toLocaleString('de-DE')} €/Tag` : ''}
          {k?.campaign_id ? ` · ${angelegt} Anzeige(n)` : ''}
        </p>
        {k?.fehler && <p className="text-xs text-red-700 mb-2">{k.fehler}</p>}
        {stand && !stand.voraussetzungen.bereit && !k?.campaign_id && (
          <p className="text-xs text-gray-500 mb-2">Fehlt noch: {stand.voraussetzungen.fehlt.join(' · ')}</p>
        )}
        {(stand?.ads ?? []).filter((a) => a.meta_fehler).map((a) => (
          <p key={a.id} className="text-xs text-amber-700 mb-1">„{a.titel}“: {a.meta_fehler}</p>
        ))}

        <div className="flex flex-wrap items-center gap-2 mt-2">
          <button
            disabled={!!laeuft || k?.status === 'aktiv'}
            onClick={() => aktion('anlegen', `/api/admin/agencies/${agencyId}/meta-kampagne`, { aktion: 'anlegen' })}
            className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs hover:bg-gray-50 disabled:opacity-50"
          >
            {laeuft === 'anlegen' ? 'Lege an …' : k?.campaign_id ? 'Neue Ads ergänzen' : 'Kampagne pausiert anlegen'}
          </button>
          <button
            disabled={!!laeuft || !k?.campaign_id || k.status === 'aktiv' || !angelegt}
            onClick={() => {
              if (window.confirm(`Kampagne jetzt starten? Ab dann läuft das Werbebudget${k?.tagesbudget ? ` (${Number(k.tagesbudget).toLocaleString('de-DE')} €/Tag)` : ''}.`)) {
                void aktion('starten', `/api/admin/agencies/${agencyId}/meta-kampagne`, { aktion: 'starten' });
              }
            }}
            className="h-8 px-3 rounded-full bg-gradient-to-b from-red-700 to-red-950 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Rocket className="w-3.5 h-3.5" /> {laeuft === 'starten' ? 'Starte …' : 'Kampagne starten'}
          </button>
          <label className="text-xs text-gray-600 inline-flex items-center gap-1.5 ml-auto">
            <input
              type="checkbox"
              checked={!!stand?.autostart}
              disabled={!!laeuft}
              onChange={(e) => aktion('autostart', `/api/admin/agencies/${agencyId}/meta-kampagne`, { aktion: 'autostart', wert: e.target.checked })}
            />
            Nach erfolgreichem Test-Lead automatisch starten
          </label>
        </div>
      </div>
    </Card>
  );
}
