'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui';

interface Daten {
  aktiv: boolean;
  fehler?: string;
  organisationen: Array<{ id: number; name: string; agencyId: string | null; vorschlag: string | null }>;
  kunden: Array<{ id: string; name: string }>;
}

/** Manatal-Firmen den Kunden zuordnen – nur zugeordnete Firmen werden übernommen */
export function ManatalKarte() {
  const [d, setD] = useState<Daten | null>(null);

  useEffect(() => {
    let aktiv = true;
    fetch('/api/admin/manatal', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Daten | null) => {
        if (aktiv && j) setD(j);
      });
    return () => {
      aktiv = false;
    };
  }, []);

  const zuordnen = async (orgId: number, agencyId: string | null, leise = false) => {
    const r = await fetch('/api/admin/manatal', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, agencyId }) });
    const j = await r.json();
    if (!r.ok) {
      toast.error(j.error ?? 'Fehler');
      return false;
    }
    setD((alt) => (alt ? { ...alt, organisationen: alt.organisationen.map((o) => (o.id === orgId ? { ...o, agencyId, vorschlag: null } : o)) } : alt));
    if (!leise) toast.success(agencyId ? 'Zugeordnet – neue Bewerber kommen ab jetzt an' : 'Zuordnung gelöst');
    return true;
  };

  const vorschlaege = d?.organisationen.filter((o) => !o.agencyId && o.vorschlag) ?? [];
  const alleUebernehmen = async () => {
    let n = 0;
    for (const o of vorschlaege) if (await zuordnen(o.id, o.vorschlag, true)) n++;
    toast.success(`${n} Firmen zugeordnet`);
  };
  const kundeName = (id: string | null) => d?.kunden.find((k) => k.id === id)?.name ?? '';

  if (!d) return null;
  return (
    <Card className="mb-4">
      <p className="text-[15px] font-semibold text-gray-900">Manatal → Kunden</p>
      <p className="mt-1 text-[13.5px] text-gray-600">
        {d.aktiv
          ? 'Neue Bewerber aus Manatal (z. B. Indeed-Anzeigen) kommen jede Minute beim zugeordneten Kunden an. Nicht zugeordnete Firmen werden ignoriert. Angeschrieben wird nur, wenn „Bewerber-Kontakt“ freigegeben ist.'
          : 'Nicht verbunden: In Vercel fehlt MANATAL_API_TOKEN.'}
      </p>
      {vorschlaege.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <span>{vorschlaege.length} Firmen über den Namen erkannt – bitte prüfen.</span>
          <button type="button" onClick={() => void alleUebernehmen()} className="rounded-lg bg-amber-800 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-amber-900">
            Vorschläge übernehmen
          </button>
        </div>
      )}
      {d.fehler && <p className="mt-2 text-[13px] text-red-700">Manatal nicht erreichbar: {d.fehler}</p>}
      {d.organisationen.length > 0 && (
        <ul className="mt-3 divide-y divide-hair">
          {d.organisationen.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-[14px] font-medium">
                {o.name}
                {!o.agencyId && o.vorschlag && <span className="ml-2 text-[12px] font-normal text-amber-800">Vorschlag: {kundeName(o.vorschlag)}</span>}
              </span>
              <select
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[13px]"
                value={o.agencyId ?? ''}
                onChange={(e) => void zuordnen(o.id, e.target.value || null)}
              >
                <option value="">Nicht übernehmen</option>
                {d.kunden.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
