'use client';

import { useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { CountUp } from '@/components/ui/motion';
import type { ErfolgsZahlen } from '@/lib/kunden-cloud/erfolg';

type Daten = ErfolgsZahlen & { darfBearbeiten: boolean };

function kachel(wert: number, label: string, o: { hero?: boolean; nachkomma?: number; suffix?: string; verz?: number } = {}) {
  return (
    <div key={label} className={`rounded-3xl p-5 ${o.hero ? 'col-span-2 bg-red-700' : 'bg-white/[0.06]'}`}>
      <p className={`font-semibold tabular-nums tracking-[-0.03em] ${o.hero ? 'text-[64px] leading-none sm:text-[84px]' : 'text-[40px] leading-none sm:text-[48px]'}`}>
        <CountUp value={wert} decimals={o.nachkomma ?? 0} suffix={o.suffix ?? ''} duration={2200} delay={o.verz ?? 0} />
      </p>
      <p className={`mt-2 text-[14px] ${o.hero ? 'text-red-100' : 'text-white/60'}`}>{label}</p>
    </div>
  );
}

/** Vollbild-Anzeige mit hochzählenden Zahlen (Hochformat, z. B. für eine Story-Aufnahme) */
export function ErfolgsAnzeige({ onClose }: { onClose: () => void }) {
  const [z, setZ] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [f, setF] = useState({ kunden: '', bewerbungen: '', einstellungen: '', tage: '5' });
  // Neu hochzählen lassen (z. B. nach dem Speichern oder für eine zweite Aufnahme)
  const [runde, setRunde] = useState(0);

  useEffect(() => {
    let aktiv = true;
    const laden = () =>
      fetch('/api/innendienst/erfolg', { cache: 'no-store' })
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? 'Fehler');
          if (aktiv) setZ(j);
        })
        .catch((e) => aktiv && setFehler(e instanceof Error ? e.message : 'Fehler'));
    void laden();
    const t = setInterval(laden, 60_000);
    const taste = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', taste);
    return () => {
      aktiv = false;
      clearInterval(t);
      window.removeEventListener('keydown', taste);
    };
  }, [onClose]);

  const speichern = async (zuruecksetzen = false) => {
    const body = zuruecksetzen ? { zuruecksetzen: true } : { kunden: Number(f.kunden), bewerbungen: Number(f.bewerbungen), einstellungen: Number(f.einstellungen), tage: Number(f.tage) };
    const r = await fetch('/api/innendienst/erfolg', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return setFehler(j.error ?? 'Fehler');
    setFehler(null);
    setZ(j);
    setBearbeiten(false);
    setRunde((x) => x + 1);
  };

  const feld = (k: keyof typeof f, label: string) => (
    <label className="block text-[12.5px] text-white/60">
      {label}
      <input
        type="number"
        min={0}
        className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-[15px] text-white"
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#0b0b0c] p-4 text-white">
      <div className="absolute right-4 top-4 flex gap-1">
        {z?.darfBearbeiten && (
          <button
            type="button"
            onClick={() => {
              setF({ kunden: String(z.kunden), bewerbungen: String(z.bewerbungen), einstellungen: String(z.einstellungen), tage: String(z.tage) });
              setBearbeiten((x) => !x);
            }}
            className="rounded-full p-2 text-white/30 hover:bg-white/10 hover:text-white"
            aria-label="Zahlen bearbeiten"
          >
            <Pencil className="h-5 w-5" />
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Schließen">
          <X className="h-6 w-6" />
        </button>
      </div>
      <div className="w-full max-w-md" onDoubleClick={() => setRunde((x) => x + 1)}>
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-red-500">Zoepp Media · Recruiting</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.02em]">Die letzten 7 Tage</h1>
        {fehler && <p className="mt-4 text-red-400">{fehler}</p>}

        {bearbeiten && z && (
          <div className="mt-5 space-y-3 rounded-2xl border border-white/10 p-4">
            <div className="grid grid-cols-2 gap-3">
              {feld('kunden', 'Kunden')}
              {feld('bewerbungen', 'Bewerbungen (7 Tage)')}
              {feld('einstellungen', 'Einstellungen (7 Tage)')}
              {feld('tage', 'Arbeitstage (für Ø/Tag)')}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => speichern()} className="h-10 rounded-lg bg-red-700 px-4 text-[14px] font-semibold">
                Speichern
              </button>
              {z.quelle === 'manuell' && (
                <button type="button" onClick={() => speichern(true)} className="h-10 rounded-lg border border-white/20 px-3 text-[14px]">
                  Wieder Live-Zahlen
                </button>
              )}
            </div>
            <p className="text-[12px] text-white/40">Aktuell: {z.quelle === 'manuell' ? 'manuell eingetragene Zahlen' : 'Live-Zahlen aus der Cloud'}</p>
          </div>
        )}

        {z && (
          <div key={runde} className="mt-6 grid grid-cols-2 gap-3">
            {kachel(z.bewerbungen, 'Bewerbungen in 7 Tagen', { hero: true })}
            {kachel(z.kunden, 'Kunden', { verz: 200 })}
            {kachel(z.proTag, `Ø pro Tag (${z.tage} Tage)`, { verz: 400 })}
            {kachel(z.einstellungen, 'Einstellungen in 7 Tagen', { verz: 600 })}
            {kachel(z.quote ?? 0, 'Einstellungsquote', { nachkomma: 1, suffix: ' %', verz: 800 })}
            {kachel(z.kunden ? Math.round(z.bewerbungen / z.kunden) : 0, 'Ø Bewerbungen pro Kunde', { verz: 1000 })}
            {kachel(z.kunden ? Math.round((z.einstellungen / z.kunden) * 10) / 10 : 0, 'Ø Einstellungen pro Kunde', { nachkomma: 1, verz: 1200 })}
          </div>
        )}
        {z && <p className="mt-5 text-[12px] text-white/30">Doppelklick: Zahlen neu hochzählen lassen</p>}
      </div>
    </div>
  );
}
