'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Trash2, Upload } from 'lucide-react';
import { KATEGORIEN, ausgabenImMonat, fixImMonat, type Ausgabe, type Fixkosten } from '@/lib/finanzen/ausgaben';
import { monatKey } from '@/lib/finanzen/cashplan';

const euro = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const FARBEN = ['#7f1d1d', '#b91c1c', '#ef4444', '#f87171', '#fca5a5', '#9a3412', '#ea580c', '#fdba74', '#6b7280', '#d1d5db'];

export function AusgabenBereich({
  monat,
  monatName,
  einnahmenNetto,
  einnahmenIst,
  ausgaben,
  fixkosten,
  neuLaden,
}: {
  monat: string;
  monatName: string;
  einnahmenNetto: number;
  einnahmenIst: number | null;
  ausgaben: Ausgabe[];
  fixkosten: Fixkosten[];
  neuLaden: () => void;
}) {
  const [offen, setOffen] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [neueFix, setNeueFix] = useState({ name: '', kategorie: 'Mitarbeiter', monatlich: '', ab: `${monat}-01` });
  const datei = useRef<HTMLInputElement>(null);
  const m = ausgabenImMonat(ausgaben, fixkosten, monat);
  const ueberschuss = einnahmenNetto - m.gesamt;
  const posten = ausgaben.filter((a) => monatKey(a.datum) === monat).sort((a, b) => b.betrag - a.betrag);
  const fixAktiv = fixkosten.filter((f) => fixImMonat(f, monat));
  const letzterUmsatz = ausgaben.reduce((max, a) => (a.datum > max ? a.datum : max), '');

  async function hochladen(f: File) {
    setLaedt(true);
    const fd = new FormData();
    fd.append('datei', f);
    const res = await fetch('/api/admin/finanzen/ausgaben/import', { method: 'POST', body: fd });
    setLaedt(false);
    const j = (await res.json().catch(() => null)) as { gelesen?: number; neu?: number; doppelt?: number; error?: string } | null;
    if (!res.ok) return toast.error(j?.error ?? 'Import fehlgeschlagen');
    toast.success(`${j?.neu} neue Umsätze${j?.doppelt ? `, ${j.doppelt} schon vorhanden` : ''}`);
    neuLaden();
  }

  async function aendern(a: Ausgabe, felder: { kategorie?: string; privat?: boolean }, alleGleichen = false) {
    const res = await fetch(`/api/admin/finanzen/ausgaben/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...felder, alleGleichen }),
    });
    if (!res.ok) return toast.error('Speichern fehlgeschlagen');
    neuLaden();
  }

  async function fixAnlegen() {
    if (!neueFix.name.trim() || !neueFix.monatlich) return toast.error('Name und Betrag ausfüllen');
    const res = await fetch('/api/admin/finanzen/fixkosten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...neueFix, monatlich: Number(neueFix.monatlich.replace(',', '.')) }),
    });
    if (!res.ok) return toast.error('Speichern fehlgeschlagen');
    setNeueFix({ ...neueFix, name: '', monatlich: '' });
    neuLaden();
  }

  async function fixLoeschen(f: Fixkosten) {
    if (!confirm(`„${f.name}“ löschen?`)) return;
    await fetch(`/api/admin/finanzen/fixkosten/${f.id}`, { method: 'DELETE' });
    neuLaden();
  }

  return (
    <Card padding="none" className="mb-8 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-5 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Ausgaben & Überschuss im {monatName}</p>
          <p className="text-xs text-gray-500">
            Kartenumsätze (Amex) + feste Kosten · Umsätze bis {letzterUmsatz ? new Date(`${letzterUmsatz}T12:00:00`).toLocaleDateString('de-DE') : '–'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={datei}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) hochladen(f);
              e.target.value = '';
            }}
          />
          <Button size="sm" variant="secondary" disabled={laedt} onClick={() => datei.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            {laedt ? 'Lädt …' : 'Amex-CSV hochladen'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 border-b border-gray-100 px-5 py-4 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500">Einnahmen (Plan, netto)</p>
          <p className="text-2xl font-bold text-gray-900">{euro(einnahmenNetto)}</p>
          {einnahmenIst != null && <p className="text-xs text-gray-500">tatsächlich eingegangen: {euro(einnahmenIst)}</p>}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500">Ausgaben</p>
          <p className="text-2xl font-bold text-gray-900">{euro(m.gesamt)}</p>
          <p className="text-xs text-gray-500">
            {!m.mitKarte ? 'nur feste Kosten – Kartenumsätze fehlen noch' : m.privat ? `ohne ${euro(m.privat)} privat` : 'Karte + feste Kosten'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500">Überschuss</p>
          <p className={`text-2xl font-bold ${ueberschuss >= 0 ? 'text-green-700' : 'text-red-700'}`}>{euro(ueberschuss)}</p>
          <p className="text-xs text-gray-500">{einnahmenNetto ? `${Math.round((ueberschuss / einnahmenNetto) * 100)} % Marge` : '–'} · vor Steuern</p>
        </div>
      </div>

      {m.proKategorie.length > 0 && (
        <div className="grid grid-cols-1 gap-6 px-5 py-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Wofür das Geld rausgeht</p>
            <div className="mb-3 flex h-3 overflow-hidden rounded-full">
              {m.proKategorie.map((k, i) => (
                <div key={k.kategorie} style={{ width: `${k.anteil * 100}%`, background: FARBEN[i % FARBEN.length] }} title={k.kategorie} />
              ))}
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {m.proKategorie.map((k, i) => (
                  <tr key={k.kategorie}>
                    <td className="py-1.5">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: FARBEN[i % FARBEN.length] }} />
                      <span className="text-gray-900">{k.kategorie}</span>
                      <span className="ml-1 text-xs text-gray-400">({k.posten})</span>
                    </td>
                    <td className="py-1.5 text-right text-gray-500">{Math.round(k.anteil * 100)} %</td>
                    <td className="py-1.5 text-right font-semibold text-gray-900">{euro(k.betrag)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Größte Posten (Karte)</p>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {m.topHaendler.map((h) => (
                  <tr key={h.haendler}>
                    <td className="py-1.5 text-gray-900">
                      {h.haendler}
                      {h.posten > 1 && <span className="ml-1 text-xs text-gray-400">×{h.posten}</span>}
                    </td>
                    <td className="py-1.5 text-right font-semibold text-gray-900">{euro(h.betrag)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="border-t border-gray-100 px-5 py-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Feste Kosten (nicht über die Karte)</p>
        <div className="space-y-1">
          {fixAktiv.map((f) => (
            <div key={f.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-900">
                {f.name} <span className="text-xs text-gray-400">· {f.kategorie}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold">{euro(f.monatlich)}</span>
                <button className="p-1 text-gray-400 hover:text-red-700" aria-label="Löschen" onClick={() => fixLoeschen(f)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Input className="col-span-2" placeholder="z. B. Miete Büro" value={neueFix.name} onChange={(e) => setNeueFix({ ...neueFix, name: e.target.value })} />
          <select
            className="h-11 rounded-[12px] bg-card px-3 text-[15px] shadow-[inset_0_0_0_1.5px_var(--hair)]"
            value={neueFix.kategorie}
            onChange={(e) => setNeueFix({ ...neueFix, kategorie: e.target.value })}
          >
            {KATEGORIEN.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <Input inputMode="decimal" placeholder="€ / Monat" value={neueFix.monatlich} onChange={(e) => setNeueFix({ ...neueFix, monatlich: e.target.value })} />
          <Button size="sm" variant="secondary" onClick={fixAnlegen}>
            Hinzufügen
          </Button>
        </div>
      </div>

      {posten.length > 0 && (
        <>
          <button className="flex w-full items-center justify-between border-t border-gray-200 px-5 py-3 text-left" onClick={() => setOffen(!offen)}>
            <span className="text-sm font-semibold text-gray-900">Alle Kartenumsätze im Monat ({posten.length}) – Kategorie ändern, privat markieren</span>
            <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${offen ? 'rotate-180' : ''}`} />
          </button>
          {offen && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {posten.map((a) => (
                    <tr key={a.id} className={a.privat ? 'opacity-50' : ''}>
                      <td className="whitespace-nowrap px-5 py-1.5 text-gray-500">{new Date(`${a.datum}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</td>
                      <td className="px-5 py-1.5 text-gray-900">{a.haendler}</td>
                      <td className="px-5 py-1.5">
                        <select
                          className="rounded-md bg-transparent text-sm text-gray-700"
                          value={a.kategorie}
                          onChange={(e) => {
                            const alle = confirm('Auch alle anderen Umsätze dieses Händlers so einordnen?');
                            aendern(a, { kategorie: e.target.value }, alle);
                          }}
                        >
                          {KATEGORIEN.map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-1.5">
                        <button onClick={() => aendern(a, { privat: !a.privat })}>
                          <Badge tone={a.privat ? 'softAccent' : 'neutral'}>{a.privat ? 'Privat' : 'Firma'}</Badge>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-5 py-1.5 text-right font-medium text-gray-900">{euro(a.betrag)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
