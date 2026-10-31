'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, PageHeader } from '@/components/ui';

interface Eintrag {
  id: string;
  quelle: string;
  externe_ref: string;
  agency_vorschlag: string | null;
  name: string | null;
  daten: Record<string, unknown>;
  gruende: string[];
  status: 'wartet' | 'offen' | 'freigegeben' | 'verworfen';
  versuche: number;
  created_at: string;
  entschieden_am?: string | null;
  ergebnis_agency_id?: string | null;
}

interface Daten {
  offen: Eintrag[];
  entschieden: Eintrag[];
  kunden: Array<{ id: string; name: string }>;
}

const QUELLE: Record<string, string> = { manatal: 'Indeed (Manatal)', perspective: 'Meta (Funnel)', meta: 'Meta', indeed_mail: 'Indeed-Mail' };
const zeit = (t: string) => new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function PruefstandClient() {
  const [d, setD] = useState<Daten | null>(null);
  const [wahl, setWahl] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const r = await fetch('/api/admin/pruefstand', { cache: 'no-store' });
    if (r.ok) setD(await r.json());
  }, []);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  const kundeName = useCallback((id: string | null | undefined) => d?.kunden.find((k) => k.id === id)?.name ?? 'kein Kunde', [d]);

  const gruppen = useMemo(() => {
    const m = new Map<string, Eintrag[]>();
    for (const e of d?.offen.filter((x) => x.status === 'offen') ?? []) {
      const k = e.agency_vorschlag ?? '';
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [d]);
  const wartend = d?.offen.filter((x) => x.status === 'wartet') ?? [];

  const entscheide = async (e: Eintrag, aktion: 'freigeben' | 'verwerfen') => {
    const agency = wahl[e.id] ?? e.agency_vorschlag ?? '';
    if (aktion === 'freigeben') {
      if (!agency) return toast.error('Bitte zuerst den Kunden wählen');
      if (!window.confirm(`${e.name ?? 'Bewerber'} an „${kundeName(agency)}“ geben?\n\nNur bestätigen, wenn du sicher bist, dass er sich bei diesem Kunden beworben hat (z. B. im Indeed-Konto des Kunden gesehen).`)) return;
    } else if (!window.confirm(`${e.name ?? 'Bewerber'} verwerfen? Er geht an keinen Kunden.`)) return;
    setLaeuft(e.id);
    const r = await fetch(`/api/admin/pruefstand/${e.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion, agency_id: agency || undefined }) });
    const j = await r.json().catch(() => ({}));
    setLaeuft(null);
    if (r.ok) toast.success(aktion === 'freigeben' ? `An ${kundeName(agency)} übergeben` : 'Verworfen');
    else toast.error(j.error ?? 'Fehlgeschlagen');
    await laden();
  };

  const alleFreigeben = async (agencyId: string, eintraege: Eintrag[]) => {
    if (!window.confirm(`Alle ${eintraege.length} Bewerber an „${kundeName(agencyId)}“ geben?\n\nNur bestätigen, wenn du sie im Indeed-/Meta-Konto dieses Kunden geprüft hast.`)) return;
    setLaeuft(agencyId);
    const r = await fetch('/api/admin/pruefstand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agency_id: agencyId, ids: eintraege.map((e) => e.id) }) });
    const j = (await r.json().catch(() => ({}))) as { ergebnisse?: Array<{ ok: boolean; grund?: string }> };
    setLaeuft(null);
    const ok = j.ergebnisse?.filter((x) => x.ok).length ?? 0;
    const fehler = (j.ergebnisse ?? []).filter((x) => !x.ok);
    toast[fehler.length ? 'warning' : 'success'](`${ok} übergeben${fehler.length ? `, ${fehler.length} nicht: ${fehler[0].grund}` : ''}`);
    await laden();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        label="ADMIN"
        title="Prüfstand Bewerber"
        description="Bewerber, deren Kunde nicht doppelt belegt ist, gehen an niemanden – sie warten hier. Ein Bewerber bekommt nur dann einen Kunden, wenn zwei unabhängige Quellen übereinstimmen oder du ihn hier freigibst."
      />
      <Card padding="none" className="bg-blue-50 p-4 text-sm text-blue-900">
        <b>Doppelter Boden:</b> Indeed-Bewerber aus Manatal brauchen zusätzlich die Indeed-Benachrichtigung aus dem Konto des Kunden (Weiterleitung an die Cloud-Adresse des Kunden). Meta-Bewerber müssen von einem Funnel kommen,
        der fest diesem Kunden zugeordnet ist. Alle 5 Minuten werden Funnels und Manatal zusätzlich abgerufen – Webhooks sind nur der schnelle Weg.
      </Card>

      {!d && <p className="text-sm text-gray-500">Lädt …</p>}
      {d && !gruppen.length && <Card padding="none" className="p-4 text-sm text-green-800">✅ Keine offenen Fälle.</Card>}

      {gruppen.map(([agencyId, eintraege]) => (
        <Card key={agencyId || 'ohne'} padding="none" className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-gray-900">
              Vorschlag: {agencyId ? kundeName(agencyId) : 'kein Kunde'} <span className="font-normal text-gray-500">· {eintraege.length} offen</span>
            </p>
            {agencyId && (
              <button disabled={laeuft === agencyId} onClick={() => alleFreigeben(agencyId, eintraege)} className="rounded-lg border border-green-600 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50">
                Alle an {kundeName(agencyId)} geben
              </button>
            )}
          </div>
          <div className="divide-y divide-gray-100">
            {eintraege.map((e) => (
              <div key={e.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{e.name ?? 'Ohne Namen'}</p>
                  <p className="text-xs text-gray-500">
                    {QUELLE[e.quelle] ?? e.quelle} · eingegangen {zeit(e.created_at)} · {e.externe_ref}
                  </p>
                  <p className="mt-1 text-xs text-red-700">{e.gruende.join(' · ')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={wahl[e.id] ?? e.agency_vorschlag ?? ''}
                    onChange={(ev) => setWahl((w) => ({ ...w, [e.id]: ev.target.value }))}
                    className="max-w-[12rem] rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                  >
                    <option value="">Kunde wählen …</option>
                    {d?.kunden.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                  <button disabled={laeuft === e.id} onClick={() => entscheide(e, 'freigeben')} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                    Freigeben
                  </button>
                  <button disabled={laeuft === e.id} onClick={() => entscheide(e, 'verwerfen')} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    Verwerfen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {wartend.length > 0 && (
        <Card padding="none" className="p-4">
          <p className="text-sm font-semibold text-gray-900">⏳ Wartet automatisch ({wartend.length})</p>
          <p className="mb-2 text-xs text-gray-500">Kontaktdaten oder der Indeed-Beleg kommen meist innerhalb weniger Minuten – diese Bewerber werden laufend neu geprüft und gehen bei Beleg automatisch an den Kunden.</p>
          <ul className="space-y-1 text-xs text-gray-700">
            {wartend.slice(0, 30).map((e) => (
              <li key={e.id}>
                {e.name ?? 'Ohne Namen'} → {kundeName(e.agency_vorschlag)} · {e.gruende[0]} · seit {zeit(e.created_at)}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!!d?.entschieden.length && (
        <Card padding="none" className="p-4">
          <p className="mb-2 text-sm font-semibold text-gray-900">Zuletzt entschieden</p>
          <ul className="space-y-1 text-xs text-gray-600">
            {d.entschieden.map((e) => (
              <li key={e.id}>
                {e.status === 'freigegeben' ? '✅' : '🗑️'} {e.name ?? 'Ohne Namen'} {e.status === 'freigegeben' ? `→ ${kundeName(e.ergebnis_agency_id)}` : 'verworfen'} · {e.entschieden_am ? zeit(e.entschieden_am) : ''}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
