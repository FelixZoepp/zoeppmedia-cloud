'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, Loader2, LogOut, Search } from 'lucide-react';
import { toast } from 'sonner';

const ROLLEN = [
  { value: 'kunde', label: 'Kunde', hinweis: 'Kunden-Cloud mit Menü, Dashboard und KI wie beim Kunden' },
  { value: 'innendienst', label: 'Innendienst', hinweis: 'Kunden-Clouds, Anrufen, Bewerber bearbeiten' },
  { value: 'csm', label: 'Kundenberater', hinweis: 'Kunden-Ergebnisse, Anfragen, Upsell-Chancen' },
  { value: 'vertrieb', label: 'Vertriebsleitung', hinweis: 'Sales-Controlling' },
  { value: 'mitarbeiter', label: 'Mitarbeiter ohne Bereich', hinweis: 'Aufgaben, Kalender, Kunden' },
] as const;

async function starte(ansicht: string, agencyId?: string) {
  const r = await fetch('/api/admin/ansicht', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ansicht, agencyId }) });
  const d = (await r.json().catch(() => ({}))) as { start?: string; error?: string };
  if (!r.ok) return toast.error(d.error ?? 'Ansicht konnte nicht gestartet werden');
  window.location.href = d.start ?? '/';
}

/** Admin: „Ansicht als …“ – Cloud so sehen, wie Kunde oder Bereich sie sehen */
export function AnsichtWechsler() {
  const [offen, setOffen] = useState(false);
  const [kundenWahl, setKundenWahl] = useState(false);
  const [kunden, setKunden] = useState<Array<{ id: string; name: string }> | null>(null);
  const [suche, setSuche] = useState('');
  const [laedt, setLaedt] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!offen) return;
    const zu = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOffen(false);
    document.addEventListener('mousedown', zu);
    return () => document.removeEventListener('mousedown', zu);
  }, [offen]);

  async function kundeWaehlen() {
    setKundenWahl(true);
    if (kunden) return;
    const r = await fetch('/api/admin/agencies');
    const d = (await r.json().catch(() => [])) as Array<{ id: string; name: string }>;
    setKunden(Array.isArray(d) ? d.map((a) => ({ id: a.id, name: a.name })).sort((a, b) => a.name.localeCompare(b.name, 'de')) : []);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOffen((o) => !o);
          setKundenWahl(false);
        }}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-3.5 text-[13.5px] font-medium text-ink shadow-[inset_0_0_0_1.5px_var(--hair)] hover:bg-red-50"
        aria-label="Ansicht als …"
      >
        <Eye className="h-4 w-4" /> <span className="hidden sm:inline">Ansicht als …</span>
      </button>
      {offen && (
        <div className="fx-dlg absolute right-0 top-12 z-50 w-[300px] overflow-hidden rounded-[16px] bg-card shadow-[0_0_0_1px_var(--hair),0_24px_60px_-20px_#1a151466]">
          {!kundenWahl ? (
            <ul className="py-1.5">
              <li className="px-4 pb-1.5 pt-1 text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Cloud ansehen als</li>
              {ROLLEN.map((r) => (
                <li key={r.value}>
                  <button
                    type="button"
                    disabled={laedt}
                    onClick={() => {
                      if (r.value === 'kunde') return void kundeWaehlen();
                      setLaedt(true);
                      void starte(r.value);
                    }}
                    className="block w-full px-4 py-2 text-left hover:bg-panel"
                  >
                    <span className="block text-[14px] font-medium">{r.label}</span>
                    <span className="block text-[12px] text-gray-500">{r.hinweis}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-3">
              <p className="mb-2 text-[13px] font-medium text-gray-600">Welcher Kunde?</p>
              <label className="mb-2 flex items-center gap-2 rounded-full bg-panel px-3 py-2">
                <Search className="h-4 w-4 text-gray-500" />
                <input autoFocus value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Kunde suchen …" className="w-full bg-transparent text-[14px] outline-none" />
              </label>
              <ul className="max-h-[300px] overflow-y-auto">
                {!kunden && (
                  <li className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </li>
                )}
                {kunden
                  ?.filter((k) => k.name.toLowerCase().includes(suche.toLowerCase()))
                  .map((k) => (
                    <li key={k.id}>
                      <button
                        type="button"
                        disabled={laedt}
                        onClick={() => {
                          setLaedt(true);
                          void starte('kunde', k.id);
                        }}
                        className="block w-full rounded-[10px] px-3 py-2 text-left text-[14px] hover:bg-panel"
                      >
                        {k.name}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Hinweisleiste während einer Demo-Ansicht */
export function AnsichtLeiste({ label }: { label: string }) {
  const [laedt, setLaedt] = useState(false);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[16px] bg-gradient-to-b from-amber-400 to-amber-500 px-4 py-2.5 text-[14px] font-medium text-amber-950">
      <Eye className="h-4 w-4 flex-none" />
      <span className="min-w-0 flex-1">
        Vorschau: <strong>{label}</strong> – so sieht es diese Rolle. Deine Admin-Rechte bleiben bestehen.
      </span>
      <button
        type="button"
        disabled={laedt}
        onClick={async () => {
          setLaedt(true);
          const r = await fetch('/api/admin/ansicht', { method: 'DELETE' });
          const d = (await r.json().catch(() => ({}))) as { start?: string };
          window.location.href = d.start ?? '/admin';
        }}
        className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" /> Zurück zur Admin-Ansicht
      </button>
    </div>
  );
}
