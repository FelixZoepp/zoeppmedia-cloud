'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Download } from 'lucide-react';
import { Badge, Button, Card, CardHead, Input, PageHeader, buttonStyles } from '@/components/ui';
import { dauerFormat, taetigkeitLabel } from '@/lib/zeiten/rechnen';

interface Zeile {
  minuten: number;
  kosten: number;
  eintraege: number;
  proTaetigkeit: Record<string, number>;
  name: string;
}

interface Daten {
  schema: boolean;
  hinweis: string | null;
  monat: string;
  stundensatz: number;
  gesamt: { minuten: number; kosten: number; eintraege: number };
  laufend: number;
  proMitarbeiter: Array<Zeile & { userId: string; funktion: string | null }>;
  proKunde: Array<Zeile & { agencyId: string | null; mrr: number | null }>;
  zuPruefen: Array<{ id: string; start: string; ende: string | null; minuten: number; name: string; kunde: string; taetigkeit: string }>;
}

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const datumFmt = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function monatJetzt(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
}

/** Tätigkeiten als kurze Liste „Support 3:10 · Anrufe 1:00“ */
function taetigkeiten(p: Record<string, number>): string {
  return Object.entries(p)
    .sort((a, b) => b[1] - a[1])
    .map(([t, m]) => `${taetigkeitLabel(t)} ${dauerFormat(m)}`)
    .join(' · ');
}

export function ZeitenAdminClient() {
  const [monat, setMonat] = useState(monatJetzt);
  const [d, setD] = useState<Daten | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [satz, setSatz] = useState('');
  const [speichert, setSpeichert] = useState(false);

  const laden = useCallback(async (m: string) => {
    setLaedt(true);
    const r = await fetch(`/api/admin/zeiten?monat=${m}`, { cache: 'no-store' }).catch(() => null);
    setLaedt(false);
    if (!r?.ok) {
      setFehler('Auswertung konnte nicht geladen werden');
      return;
    }
    const daten = (await r.json()) as Daten;
    setFehler(null);
    setD(daten);
    setSatz(String(daten.stundensatz).replace('.', ','));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Auswertung beim Monatswechsel laden
    void laden(monat);
  }, [laden, monat]);

  async function satzSpeichern() {
    setSpeichert(true);
    const r = await fetch('/api/admin/zeiten', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stundensatz: satz }) }).catch(() => null);
    setSpeichert(false);
    if (!r?.ok) {
      const e = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
      setFehler(e?.error ?? 'Stundensatz konnte nicht gespeichert werden');
      return;
    }
    void laden(monat);
  }

  const csvLink = (art: string) => `/api/admin/zeiten?monat=${monat}&format=csv&art=${art}`;

  return (
    <div className="max-w-6xl">
      <PageHeader
        label="TEAM"
        title="Zeiterfassung"
        description="Teamstunden je Mitarbeiter und Kunde – Kosten = Stunden × interner Stundensatz, Marge = MRR − Kosten."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Input type="month" value={monat} onChange={(e) => e.target.value && setMonat(e.target.value)} className="w-[170px]" />
            <Link href="/zeiten" className="text-sm font-medium text-red-700 hover:text-red-900">Meine Zeiten →</Link>
          </div>
        }
      />

      {d && !d.schema && (
        <Card padding="sm" className="mb-5 !bg-amber-50 text-[14px] text-amber-800">
          {d.hinweis ?? 'Datenbank-Änderung fehlt noch'}
        </Card>
      )}
      {fehler && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{fehler}</p>}

      {!d ? (
        <div className="flex items-center justify-center py-24">
          {laedt && <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-600" />}
        </div>
      ) : (
        <div className={`grid gap-5 ${laedt ? 'opacity-60' : ''}`}>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card padding="sm">
              <p className="text-xs text-gray-500">Stunden gesamt</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{dauerFormat(d.gesamt.minuten)} h</p>
            </Card>
            <Card padding="sm">
              <p className="text-xs text-gray-500">Kosten</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{eur.format(d.gesamt.kosten)}</p>
            </Card>
            <Card padding="sm">
              <p className="text-xs text-gray-500">Laufende Stoppuhren</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{d.laufend}</p>
            </Card>
            <Card padding="sm">
              <p className="text-xs text-gray-500">Stundensatz intern (€/h)</p>
              <div className="mt-1 flex items-center gap-2">
                <Input value={satz} onChange={(e) => setSatz(e.target.value)} inputMode="decimal" className="w-24" aria-label="Stundensatz in Euro" />
                <Button size="sm" variant="soft" onClick={satzSpeichern} disabled={speichert || satz === String(d.stundensatz).replace('.', ',')}>
                  Speichern
                </Button>
              </div>
            </Card>
          </div>

          {d.zuPruefen.length > 0 && (
            <Card padding="sm" className="!bg-amber-50">
              <p className="flex items-center gap-1.5 text-[14px] font-medium text-amber-800">
                <AlertTriangle className="h-4 w-4" /> {d.zuPruefen.length} Einträge über 10 Stunden – bitte mit dem Mitarbeiter klären
              </p>
              <ul className="mt-2 grid gap-1 text-[13px] text-amber-900">
                {d.zuPruefen.map((z) => (
                  <li key={z.id}>
                    {z.name}: {datumFmt.format(new Date(z.start))} · {z.kunde} · {taetigkeitLabel(z.taetigkeit)} · {dauerFormat(z.minuten)} h{z.ende ? '' : ' (läuft noch)'}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHead
              title="Je Kunde"
              action={
                <a href={csvLink('kunden')} className={buttonStyles('ghost', 'sm')}>
                  <Download /> CSV
                </a>
              }
            />
            {d.proKunde.length === 0 ? (
              <p className="mt-4 text-[14px] text-gray-500">Keine Zeiten in diesem Monat.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-[14px]">
                  <thead>
                    <tr className="border-b border-[var(--hair)] text-left text-[12.5px] text-gray-500">
                      <th className="py-2 pr-3 font-medium">Kunde</th>
                      <th className="py-2 pr-3 text-right font-medium">Stunden</th>
                      <th className="py-2 pr-3 text-right font-medium">Kosten</th>
                      <th className="py-2 pr-3 text-right font-medium">MRR</th>
                      <th className="py-2 pr-3 text-right font-medium">Marge</th>
                      <th className="py-2 font-medium">Tätigkeiten</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.proKunde.map((k) => {
                      const marge = k.mrr === null ? null : k.mrr - k.kosten;
                      return (
                        <tr key={k.agencyId ?? 'intern'} className="border-b border-[var(--hair)] last:border-0">
                          <td className="py-2 pr-3 font-medium">
                            {k.agencyId ? <Link href={`/clients/${k.agencyId}`} className="hover:underline">{k.name}</Link> : <span className="text-gray-600">Intern (kein Kunde)</span>}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{dauerFormat(k.minuten)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{eur.format(k.kosten)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-gray-600">{k.mrr === null ? '–' : eur.format(k.mrr)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {marge === null ? '–' : <Badge tone={marge < 0 ? 'danger' : marge < (k.mrr ?? 0) * 0.3 ? 'warning' : 'success'}>{eur.format(marge)}</Badge>}
                          </td>
                          <td className="py-2 text-[12.5px] text-gray-500">{taetigkeiten(k.proTaetigkeit)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHead
              title="Je Mitarbeiter"
              action={
                <div className="flex gap-1">
                  <a href={csvLink('mitarbeiter')} className={buttonStyles('ghost', 'sm')}>
                    <Download /> CSV
                  </a>
                  <a href={csvLink('eintraege')} className={buttonStyles('ghost', 'sm')}>
                    <Download /> Alle Einträge
                  </a>
                </div>
              }
            />
            {d.proMitarbeiter.length === 0 ? (
              <p className="mt-4 text-[14px] text-gray-500">Keine Zeiten in diesem Monat.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-[14px]">
                  <thead>
                    <tr className="border-b border-[var(--hair)] text-left text-[12.5px] text-gray-500">
                      <th className="py-2 pr-3 font-medium">Mitarbeiter</th>
                      <th className="py-2 pr-3 text-right font-medium">Stunden</th>
                      <th className="py-2 pr-3 text-right font-medium">Kosten</th>
                      <th className="py-2 pr-3 text-right font-medium">Einträge</th>
                      <th className="py-2 font-medium">Tätigkeiten</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.proMitarbeiter.map((m) => (
                      <tr key={m.userId} className="border-b border-[var(--hair)] last:border-0">
                        <td className="py-2 pr-3 font-medium">{m.name}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{dauerFormat(m.minuten)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{eur.format(m.kosten)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-gray-600">{m.eintraege}</td>
                        <td className="py-2 text-[12.5px] text-gray-500">{taetigkeiten(m.proTaetigkeit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
