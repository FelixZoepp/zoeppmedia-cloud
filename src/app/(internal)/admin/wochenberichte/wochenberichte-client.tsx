'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, PageHeader } from '@/components/ui';

type Status = 'auf_kurs' | 'achtung' | 'kritisch';
interface Kunde {
  id: string;
  name: string;
  phase: string | null;
  pausiert: boolean;
  empfaenger: Array<{ email: string; name: string | null }>;
  letzter: { jahr: number; kw: number; status: Status; gesendet_am: string | null; fehler: string | null } | null;
}
interface Daten {
  aktiv: boolean;
  darfSenden: boolean;
  kunden: Kunde[];
}

const STATUS: Record<Status, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  auf_kurs: { label: 'Auf Kurs', tone: 'success' },
  achtung: { label: 'Achtung', tone: 'warning' },
  kritisch: { label: 'Kritisch', tone: 'danger' },
};
const ERGEBNIS: Record<string, string> = {
  gesendet: 'gesendet',
  schon_gesendet: 'war schon gesendet',
  kein_empfaenger: 'kein Empfänger',
  pausiert: 'pausiert',
  fehler: 'Fehler',
};

export function WochenberichteClient() {
  const [d, setD] = useState<Daten | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const r = await fetch('/api/admin/wochenberichte', { cache: 'no-store' });
    if (r.ok) setD(await r.json());
  }, []);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    const r = await fetch('/api/admin/wochenberichte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return void toast.error(data.error ?? 'Fehler');
    if (body.aktion === 'automatik') toast.success(data.aktiv ? 'Automatik an – Versand jeden Montag 8 Uhr' : 'Automatik aus');
    else {
      const liste = (data.ergebnis ?? []) as Array<{ name: string; ergebnis: string; fehler?: string }>;
      const gesendet = liste.filter((x) => x.ergebnis === 'gesendet').length;
      const probleme = liste.filter((x) => x.ergebnis === 'fehler' || x.ergebnis === 'kein_empfaenger');
      if (liste.length === 1) {
        const x = liste[0];
        toast[x.ergebnis === 'gesendet' ? 'success' : 'error'](`${x.name}: ${ERGEBNIS[x.ergebnis] ?? x.ergebnis}${x.fehler ? ` (${x.fehler})` : ''}`);
      } else {
        toast.success(`${gesendet} Berichte gesendet${probleme.length ? ` · Probleme: ${probleme.map((x) => x.name).join(', ')}` : ''}`);
      }
    }
    void laden();
  }

  return (
    <div>
      <PageHeader
        title="Wochenberichte"
        description="Jeder Kunde bekommt montags seinen Stand: auf Kurs, Achtung oder Gegensteuern – mit Zahlen, offenen Aufgaben und was wir erledigt haben."
      />

      {d && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[16px] font-medium">Automatischer Versand montags um 8 Uhr</p>
              <p className="text-[13.5px] text-gray-600">
                {d.aktiv ? 'Ist an.' : 'Ist aus – schau dir vorher ein paar Vorschauen an.'} Kritische Kunden meldet die Cloud danach dem Team.
              </p>
            </div>
            {d.darfSenden && (
              <div className="flex flex-wrap gap-2">
                <Button variant={d.aktiv ? 'secondary' : 'primary'} disabled={busy !== null} onClick={() => post({ aktion: 'automatik', aktiv: !d.aktiv }, 'automatik')}>
                  {d.aktiv ? 'Automatik ausschalten' : 'Automatik einschalten'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => confirm('Diese Woche allen Kunden ihren Bericht schicken? Schon gesendete werden nicht doppelt verschickt.') && post({ aktion: 'senden' }, 'alle')}
                >
                  <Send className="h-4 w-4" /> {busy === 'alle' ? 'Sendet …' : 'Jetzt an alle senden'}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card padding="none">
        <ul className="divide-y divide-gray-100">
          {!d && <li className="p-5 text-[14px] text-gray-500">Lädt …</li>}
          {d?.kunden.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{k.name}</p>
                <p className="truncate text-[13px] text-gray-500">
                  {k.empfaenger.length ? k.empfaenger.map((e) => e.email).join(', ') : 'Kein Empfänger – Kunden-Login anlegen'}
                  {k.pausiert && ' · pausiert'}
                </p>
              </div>
              {k.letzter ? (
                <span className="flex items-center gap-2 text-[13px] text-gray-600">
                  <Badge tone={STATUS[k.letzter.status].tone}>{STATUS[k.letzter.status].label}</Badge>
                  KW {k.letzter.kw} · {k.letzter.gesendet_am ? `gesendet ${new Date(k.letzter.gesendet_am).toLocaleDateString('de-DE')}` : 'nicht gesendet'}
                </span>
              ) : (
                <span className="text-[13px] text-gray-400">noch kein Bericht</span>
              )}
              <div className="flex gap-2">
                <a
                  href={`/api/admin/wochenberichte/vorschau?agency=${k.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3.5 text-[13px] font-medium hover:bg-gray-50"
                >
                  <Eye className="h-4 w-4" /> Vorschau
                </a>
                {d.darfSenden && (
                  <Button size="sm" variant="secondary" disabled={busy !== null || !k.empfaenger.length} onClick={() => post({ aktion: 'senden', agency_id: k.id, erneut: true }, k.id)}>
                    <Send className="h-4 w-4" /> {busy === k.id ? 'Sendet …' : 'Senden'}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
