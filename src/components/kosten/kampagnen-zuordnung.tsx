'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { KampagnenEintrag } from '@/lib/kosten/kampagnen';
import { eur } from './kosten-kacheln';

interface Liste {
  status: 'ok' | 'tabelle_fehlt';
  kampagnen: KampagnenEintrag[];
  metaVerbunden: boolean;
  werbekonto: string | null;
  letzterAbgleich: { status: string; meldung: string | null; am: string } | null;
}

const auswahlKlasse = 'h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm outline-none focus:border-red-500';
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Nur intern: Kampagnen aus dem Werbekonto des Kunden einer Stelle zuordnen.
 * Mit `jobId` (Stellen-Einstellungen) fest diese Stelle, sonst wählbar.
 */
export function KampagnenZuordnung({
  agencyId,
  jobId,
  stellen = [],
  onGeaendert,
}: {
  agencyId: string;
  jobId?: string;
  stellen?: Array<{ id: string; title: string }>;
  onGeaendert?: () => void;
}) {
  const [d, setD] = useState<Liste | null>(null);
  const [kampagne, setKampagne] = useState('');
  const [stelle, setStelle] = useState(jobId ?? '');
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    const r = await fetch(`/api/admin/kampagnen?agency=${agencyId}`, { cache: 'no-store' });
    if (r.ok) setD(await r.json());
  }, [agencyId]);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function aktion(body: Record<string, unknown>, ok: (j: Record<string, unknown>) => string) {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/kampagnen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) toast.error(String(j.error ?? 'Fehlgeschlagen'));
      else {
        toast.success(ok(j));
        setKampagne('');
        onGeaendert?.();
      }
      await laden();
    } finally {
      setBusy(false);
    }
  }

  if (!d) return null;
  if (d.status === 'tabelle_fehlt') return <p className="text-xs text-amber-700">Datenbank-Änderung fehlt noch – Kampagnen können erst danach zugeordnet werden.</p>;

  const zugeordnet = d.kampagnen.filter((k) => k.zuordnung && (!jobId || k.zuordnung.job_id === jobId));
  const waehlbar = d.kampagnen.filter((k) => !zugeordnet.includes(k));
  const gewaehlt = d.kampagnen.find((k) => k.campaign_id === kampagne);
  const stellenName = new Map(stellen.map((s) => [s.id, s.title]));
  const zielStelle = jobId ?? stelle;

  return (
    <div className="space-y-3">
      {!d.metaVerbunden && <p className="text-xs text-amber-700">Meta nicht verbunden – es fehlt META_SYSTEM_USER_TOKEN.</p>}
      {!d.werbekonto && <p className="text-xs text-amber-700">Kein Meta-Werbekonto hinterlegt – unter Integrationen eintragen und prüfen.</p>}
      {d.letzterAbgleich && d.letzterAbgleich.status !== 'ok' && (
        <p className="text-xs text-red-600">
          {d.letzterAbgleich.status === 'kein_zugriff' ? 'Kein Zugriff auf Werbekonto' : d.letzterAbgleich.meldung ?? 'Abgleich fehlgeschlagen'} ({zeit(d.letzterAbgleich.am)})
        </p>
      )}

      {zugeordnet.length > 0 ? (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {zugeordnet.map((k) => (
            <div key={k.campaign_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-gray-900">{k.name}</span>
                <span className="text-[11px] text-gray-500">
                  {eur(k.ausgaben30)} in 30 Tagen
                  {!jobId && k.zuordnung && ` · ${stellenName.get(k.zuordnung.job_id) ?? k.zuordnung.job_title ?? 'Stelle'}`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={k.zuordnung?.quelle === 'auto' ? 'neutral' : 'outline'}>{k.zuordnung?.quelle === 'auto' ? 'automatisch' : 'manuell'}</Badge>
                <button className="text-xs text-gray-400 hover:text-red-600" disabled={busy} onClick={() => void aktion({ aktion: 'entfernen', campaign_id: k.campaign_id }, () => 'Zuordnung entfernt')}>
                  Entfernen
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500">{jobId ? 'Noch keine Meta-Kampagne dieser Stelle zugeordnet.' : 'Noch keine Kampagne einer Stelle zugeordnet.'}</p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label className="text-xs font-medium text-gray-600">Kampagne</label>
          <select value={kampagne} onChange={(e) => setKampagne(e.target.value)} className={auswahlKlasse}>
            <option value="">Kampagne wählen …</option>
            {waehlbar.map((k) => (
              <option key={k.campaign_id} value={k.campaign_id}>
                {k.name} · {eur(k.ausgaben30)}
                {k.zuordnung ? ` · bei ${k.zuordnung.job_title ?? 'anderer Stelle'}` : ''}
              </option>
            ))}
          </select>
        </div>
        {!jobId && (
          <div className="w-48">
            <label className="text-xs font-medium text-gray-600">Stelle</label>
            <select value={stelle} onChange={(e) => setStelle(e.target.value)} className={auswahlKlasse}>
              <option value="">Stelle wählen …</option>
              {stellen.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>
        )}
        <Button
          size="sm"
          disabled={busy || !kampagne || !zielStelle}
          onClick={() => void aktion({ aktion: 'zuordnen', campaign_id: kampagne, agency_id: agencyId, job_id: zielStelle, campaign_name: gewaehlt?.name }, () => 'Kampagne zugeordnet')}
        >
          Zuordnen
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" disabled={busy || !d.werbekonto} onClick={() => void aktion({ aktion: 'abgleichen', agency_id: agencyId }, (j) => `${j.zeilen ?? 0} Kampagnen-Tage abgeglichen`)}>
          Jetzt abgleichen
        </Button>
        {!jobId && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void aktion({ aktion: 'aus_bewerbern', agency_id: agencyId }, (j) => `${j.zugeordnet ?? 0} Kampagnen zugeordnet${j.offen ? `, ${j.offen} nicht eindeutig` : ''}`)}
          >
            Kampagnen aus vorhandenen Bewerbern zuordnen
          </Button>
        )}
      </div>
      {d.kampagnen.length === 0 && d.werbekonto && <p className="text-[11px] text-gray-400">Noch keine Kampagnen abgeglichen – „Jetzt abgleichen“ holt die letzten 7 Tage aus dem Werbekonto.</p>}
    </div>
  );
}
