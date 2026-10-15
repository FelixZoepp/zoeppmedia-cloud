'use client';

import { useEffect, useState } from 'react';
import { Check, Settings2, X } from 'lucide-react';
import { Card } from '@/components/ui';
import type { Ergebnis } from '@/lib/einrichtung/check';

/** /admin/health: Was fehlt noch für den Testlauf? (Vercel-Variablen + Datenbank-Änderungen) */
export function EinrichtungCard() {
  const [d, setD] = useState<Ergebnis | null>(null);

  useEffect(() => {
    let ab = false;
    fetch('/api/admin/einrichtung', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => !ab && setD(x));
    return () => {
      ab = true;
    };
  }, []);

  if (!d) return null;
  const fehlendeEnv = d.env.filter((e) => !e.gesetzt);
  const fehlendeDb = d.db.filter((x) => !x.ok);
  const bereiche = [...new Set(d.env.map((e) => e.bereich))];

  return (
    <Card className="mb-6">
      <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
        <Settings2 className="h-5 w-5 text-red-800" /> Einrichtung
      </h2>
      <p className="mt-1 text-[13.5px] text-gray-600">
        {fehlendeEnv.length + fehlendeDb.length === 0
          ? 'Alles eingerichtet.'
          : `${fehlendeEnv.length} Variable${fehlendeEnv.length === 1 ? '' : 'n'} in Vercel fehlen · ${fehlendeDb.length} Datenbank-Änderung${fehlendeDb.length === 1 ? '' : 'en'} nicht eingespielt`}
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-gray-500">Vercel-Variablen</h3>
          {bereiche.map((b) => (
            <div key={b} className="mb-3">
              <p className="text-[13px] font-medium text-gray-700">{b}</p>
              <ul className="mt-1 space-y-1">
                {d.env
                  .filter((e) => e.bereich === b)
                  .map((e) => (
                    <li key={e.name} className="flex items-start gap-2 text-[13.5px]">
                      <Status ok={e.gesetzt} stufe={e.stufe} />
                      <span className="min-w-0">
                        <code className="font-mono text-[12.5px]">{e.name}</code>
                        <span className="text-gray-500"> · {e.wofuer}</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        <div>
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-gray-500">Datenbank-Änderungen</h3>
          <ul className="space-y-1.5">
            {d.db.map((x) => (
              <li key={x.datei} className="flex items-start gap-2 text-[13.5px]">
                <Status ok={x.ok} stufe="pflicht" />
                <span className="min-w-0">
                  {x.name}
                  {!x.ok && <code className="block font-mono text-[12px] text-gray-500">supabase/migrations/{x.datei}</code>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function Status({ ok, stufe }: { ok: boolean; stufe: string }) {
  if (ok) return <Check className="mt-0.5 h-4 w-4 flex-none text-green-600" aria-label="OK" />;
  return <X className={`mt-0.5 h-4 w-4 flex-none ${stufe === 'optional' ? 'text-gray-400' : stufe === 'wichtig' ? 'text-amber-600' : 'text-red-600'}`} aria-label="Fehlt" />;
}
