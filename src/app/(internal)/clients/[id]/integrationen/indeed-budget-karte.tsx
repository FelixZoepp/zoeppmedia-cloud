'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Wallet } from 'lucide-react';

interface Phase {
  id: string;
  tagesbudget: number;
  start: string;
  ende: string | null;
  job_id?: string | null;
}
interface Stelle {
  id: string;
  title: string;
}
interface Zeitraum {
  von: string;
  kosten: number;
  tage: number;
  bewerber: number;
  leadpreis: number | null;
}
interface Daten {
  phasen: Phase[];
  /** Budget je Stelle möglich (Migration eingespielt) */
  jeStelle?: boolean;
  stellen?: Stelle[];
  indeedKonto?: string | null;
  laeuft: boolean;
  tage30: Zeitraum;
  seitStart: Zeitraum | null;
}

const eur = (n: number | null) => (n == null ? '–' : `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const dt = (d: string) => d.split('-').reverse().join('.');
const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

/** Indeed-Tagesbudget mit Startdatum → Kosten und Leadpreis (Kosten ÷ Indeed-Bewerber) */
export function IndeedBudgetKarte({ agencyId }: { agencyId: string }) {
  const [d, setD] = useState<Daten | null>(null);
  const [budget, setBudget] = useState('');
  const [start, setStart] = useState(heute());
  const [stelle, setStelle] = useState('');
  const [konto, setKonto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    const r = await fetch(`/api/admin/agencies/${agencyId}/indeed-budget`, { cache: 'no-store' });
    if (r.ok) setD(await r.json());
  }, [agencyId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  async function senden(method: 'POST' | 'PATCH', body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/agencies/${agencyId}/indeed-budget`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) toast.error(j.error ?? 'Fehlgeschlagen');
      else {
        toast.success(ok);
        setBudget('');
        await laden();
      }
    } finally {
      setBusy(false);
    }
  }

  // Laufende Phase der gewählten Spur (Stelle bzw. ganzer Kunde)
  const laufend = d?.phasen.find((p) => (p.job_id ?? '') === stelle && (!p.ende || p.ende >= heute()));
  const stellenName = new Map((d?.stellen ?? []).map((s) => [s.id, s.title]));

  return (
    <Card padding="lg">
      <div className="flex items-center gap-4 mb-5">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
          <Wallet className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-gray-900">Indeed-Budget & Leadpreis</h2>
          <p className="text-xs text-gray-500 mt-0.5">Eigenes Indeed-Konto des Kunden, Tagesbudget mit Startdatum – Kosten = Tagesbudget × Tage, Leadpreis = Kosten ÷ Indeed-Bewerber</p>
        </div>
        {d && <Badge tone={d.laeuft ? 'success' : 'neutral'}>{d.laeuft ? 'Läuft' : d.phasen.length ? 'Pausiert' : 'Kein Budget'}</Badge>}
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="w-72">
          <label className="text-xs font-medium text-gray-600">Indeed-Konto des Kunden (Bezeichnung/ID)</label>
          <Input value={konto ?? d?.indeedKonto ?? ''} onChange={(e) => setKonto(e.target.value)} placeholder="z. B. Firmenname oder Konto-ID" />
        </div>
        {konto !== null && konto !== (d?.indeedKonto ?? '') && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void senden('PATCH', { indeed_konto: konto }, 'Indeed-Konto gespeichert').then(() => setKonto(null))}>
            Speichern
          </Button>
        )}
      </div>

      {d && (d.seitStart || d.phasen.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Zahl label="Kosten 30 Tage" wert={eur(d.tage30.kosten)} />
          <Zahl label="Leadpreis 30 Tage" wert={eur(d.tage30.leadpreis)} sub={`${d.tage30.bewerber} Bewerber`} hero />
          <Zahl label={`Kosten seit ${d.seitStart ? dt(d.seitStart.von) : '–'}`} wert={eur(d.seitStart?.kosten ?? null)} />
          <Zahl label="Leadpreis seit Start" wert={eur(d.seitStart?.leadpreis ?? null)} sub={`${d.seitStart?.bewerber ?? 0} Bewerber`} />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36">
          <label className="text-xs font-medium text-gray-600">Tagesbudget (€)</label>
          <Input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="z. B. 25" />
        </div>
        <div className="w-44">
          <label className="text-xs font-medium text-gray-600">Ab (Startdatum)</label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        {d?.jeStelle && (d.stellen?.length ?? 0) > 0 && (
          <div className="w-56">
            <label className="text-xs font-medium text-gray-600">Für</label>
            <select
              value={stelle}
              onChange={(e) => setStelle(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-red-500"
            >
              <option value="">Ganzer Kunde</option>
              {d.stellen!.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>
        )}
        <Button size="sm" disabled={busy || !budget || !start} onClick={() => void senden('POST', { tagesbudget: budget, start, job_id: stelle || null }, 'Budget gespeichert')}>
          {laufend ? 'Budget ändern' : 'Budget starten'}
        </Button>
        {laufend && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void senden('PATCH', { id: laufend.id, ende: heute() }, 'Indeed pausiert')}>
            Ab heute pausieren
          </Button>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-2">Budget ändern beendet das laufende Budget (derselben Stelle bzw. des ganzen Kunden) am Vortag. Pausieren stoppt die Kosten ab morgen und schaltet die Indeed-Warnung für diesen Kunden ab.</p>

      {d && d.phasen.length > 0 && (
        <div className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-100">
          {d.phasen.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-gray-800">
                {eur(p.tagesbudget)} / Tag · {dt(p.start)} – {p.ende ? dt(p.ende) : 'läuft'}
                {d.jeStelle && <span className="ml-2 text-xs text-gray-500">{p.job_id ? stellenName.get(p.job_id) ?? 'Stelle' : 'Ganzer Kunde'}</span>}
              </span>
              <button
                className="text-xs text-gray-400 hover:text-red-600"
                disabled={busy}
                onClick={() => confirm('Diesen Budget-Eintrag löschen?') && void senden('PATCH', { id: p.id, loeschen: true }, 'Gelöscht')}
              >
                Löschen
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Zahl({ label, wert, sub, hero = false }: { label: string; wert: string; sub?: string; hero?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${hero ? 'bg-blue-50' : 'bg-gray-50'}`}>
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className="text-base font-bold text-gray-900">{wert}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}
