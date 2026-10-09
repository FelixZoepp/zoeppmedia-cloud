'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Button, Card } from '@/components/ui';
import { CountUp } from '@/components/ui/motion';
import type { ErfolgsZahlen, KundenZahl } from '@/lib/kunden-cloud/erfolg';

type Daten = ErfolgsZahlen & { kundenListe: KundenZahl[]; darfBearbeiten: boolean };

const BLUR_KEY = 'zm_innendienst_namen_blur';

/** Tab „Zahlen“: Gesamtzahlen der letzten 7 Tage + je Kunde, Kundennamen auf Knopfdruck unscharf */
export function ZahlenTab() {
  const [z, setZ] = useState<Daten | null>(null);
  const [blur, setBlur] = useState(false);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [f, setF] = useState({ kunden: '', bewerbungen: '', einstellungen: '', tage: '5' });
  const [runde, setRunde] = useState(0);

  useEffect(() => {
    let aktiv = true;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- einmalig aus dem Browser-Speicher
      setBlur(localStorage.getItem(BLUR_KEY) === '1');
    } catch {
      /* Speicher gesperrt */
    }
    fetch('/api/innendienst/erfolg', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Fehler');
        if (aktiv) setZ(j);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Zahlen nicht ladbar'));
    return () => {
      aktiv = false;
    };
  }, []);

  const umschalten = () => {
    setBlur((b) => {
      try {
        localStorage.setItem(BLUR_KEY, b ? '0' : '1');
      } catch {
        /* egal */
      }
      return !b;
    });
  };

  const speichern = async (zuruecksetzen = false) => {
    const body = zuruecksetzen ? { zuruecksetzen: true } : { kunden: Number(f.kunden), bewerbungen: Number(f.bewerbungen), einstellungen: Number(f.einstellungen), tage: Number(f.tage) };
    const r = await fetch('/api/innendienst/erfolg', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error ?? 'Fehler');
    setZ(j);
    setBearbeiten(false);
    setRunde((x) => x + 1);
  };

  if (!z) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
      </div>
    );
  }

  const kachel = (wert: number, label: string, o: { hero?: boolean; nachkomma?: number; suffix?: string; verz?: number } = {}) => (
    <Card key={label} className={o.hero ? 'col-span-2 bg-gradient-to-b from-red-700 to-red-900 text-white lg:col-span-1' : ''}>
      <p className={`font-semibold tabular-nums tracking-[-0.03em] ${o.hero ? 'text-[40px]' : 'text-[32px]'} leading-none`}>
        <CountUp value={wert} decimals={o.nachkomma ?? 0} suffix={o.suffix ?? ''} duration={1800} delay={o.verz ?? 0} />
      </p>
      <p className={`mt-2 text-[13px] ${o.hero ? 'text-red-100' : 'text-gray-600'}`}>{label}</p>
    </Card>
  );
  const quote = (b: number, e: number) => (b ? `${((e / b) * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %` : '–');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-gray-500">Letzte 7 Tage · Doppelklick auf die Zahlen lässt sie neu hochzählen</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={umschalten}>
            {blur ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} {blur ? 'Namen zeigen' : 'Namen verbergen'}
          </Button>
          {z.darfBearbeiten && (
            <Button
              variant="secondary"
              aria-label="Gesamtzahlen bearbeiten"
              onClick={() => {
                setF({ kunden: String(z.kunden), bewerbungen: String(z.bewerbungen), einstellungen: String(z.einstellungen), tage: String(z.tage) });
                setBearbeiten((x) => !x);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {bearbeiten && (
        <Card className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ['kunden', 'Kunden'],
                ['bewerbungen', 'Bewerbungen (7 Tage)'],
                ['einstellungen', 'Einstellungen (7 Tage)'],
                ['tage', 'Arbeitstage (Ø/Tag)'],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="block text-[12.5px] text-gray-600">
                {l}
                <input type="number" min={0} className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => speichern()}>Speichern</Button>
            {z.quelle === 'manuell' && (
              <Button variant="secondary" onClick={() => speichern(true)}>
                Wieder Live-Zahlen
              </Button>
            )}
            <span className="text-[12px] text-gray-500">Aktuell: {z.quelle === 'manuell' ? 'eingetragene Gesamtzahlen' : 'Live-Zahlen aus der Cloud'}</span>
          </div>
        </Card>
      )}

      <div key={runde} className="grid grid-cols-2 gap-3 lg:grid-cols-5" onDoubleClick={() => setRunde((x) => x + 1)}>
        {kachel(z.bewerbungen, 'Bewerbungen in 7 Tagen', { hero: true })}
        {kachel(z.kunden, 'Kunden', { verz: 150 })}
        {kachel(z.proTag, `Ø Bewerbungen pro Tag (${z.tage} Tage)`, { verz: 300 })}
        {kachel(z.einstellungen, 'Einstellungen in 7 Tagen', { verz: 450 })}
        {kachel(z.quote ?? 0, 'Einstellungsquote', { nachkomma: 1, suffix: ' %', verz: 600 })}
      </div>

      <Card padding="sm">
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <p className="text-[15px] font-medium">Kunden in der Cloud</p>
          <p className="text-[12px] text-gray-500">live · letzte 7 Tage</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[12px] uppercase tracking-wide text-gray-500">
                <th className="px-2 py-2 font-semibold">Kunde</th>
                <th className="px-2 py-2 text-right font-semibold">Bewerbungen</th>
                <th className="px-2 py-2 text-right font-semibold">Einstellungen</th>
                <th className="px-2 py-2 text-right font-semibold">Quote</th>
              </tr>
            </thead>
            <tbody>
              {z.kundenListe.map((k) => (
                <tr key={k.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-2 py-2">
                    <div className={`flex items-center gap-2.5 transition ${blur ? 'select-none blur-[6px]' : ''}`} aria-hidden={blur}>
                      <Avatar name={k.name} src={k.logo_url} size={28} />
                      <span className="truncate font-medium">{k.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{k.bewerbungen}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{k.einstellungen}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-600">{quote(k.bewerbungen, k.einstellungen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
