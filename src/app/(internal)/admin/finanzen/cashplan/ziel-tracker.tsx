'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { STANDARD_ZIELE, neukundenFuerZiel, zielZeilen, type KundenKennzahlen, type Ziele } from '@/lib/finanzen/ziele';

const euro = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const wert = (v: number | null, f: 'euro' | 'zahl' | 'prozent') =>
  v == null ? '–' : f === 'euro' ? euro(v) : f === 'prozent' ? `${Math.round(v * 100)} %` : String(Math.round(v * 10) / 10);

const FELDER: Array<{ key: keyof Ziele; label: string; prozent?: boolean }> = [
  { key: 'umsatzMonat', label: 'Umsatz pro Monat (€ netto)' },
  { key: 'neukundenMonat', label: 'Neue Kunden pro Monat' },
  { key: 'upsellQuote', label: 'Upsell-Quote (%)', prozent: true },
  { key: 'churnMax', label: 'Churn höchstens (%)', prozent: true },
  { key: 'kundenProKopf', label: 'Kunden pro Fulfillment-Person' },
  { key: 'fulfillmentKoepfe', label: 'Personen im Fulfillment' },
  { key: 'margeMin', label: 'Marge mindestens (%)', prozent: true },
  { key: 'werbeanteilMax', label: 'Werbung höchstens (% der MRR)', prozent: true },
];

export function ZielTracker({
  monatName,
  ziele,
  einnahmen,
  monatsgebuehren,
  ueberschuss,
  werbung,
  aktiveVertraege,
  kunden,
  historie,
  gespeichert,
}: {
  monatName: string;
  ziele: Ziele;
  einnahmen: number;
  monatsgebuehren: number;
  ueberschuss: number;
  werbung: number;
  aktiveVertraege: number;
  kunden: KundenKennzahlen;
  historie?: { kunden: number; upsell: number; rueckgewinnung: number } | null;
  gespeichert: (z: Ziele) => void;
}) {
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const zeilen = zielZeilen({ ziele, einnahmen, monatsgebuehren, ueberschuss, werbung, aktiveVertraege, kunden });
  const noetig = neukundenFuerZiel(ziele.umsatzMonat, kunden.ltvWiederkehrend);
  const erreicht = zeilen.filter((z) => z.erreicht).length;

  async function speichern() {
    if (!form) return;
    const z: Record<string, number> = {};
    for (const f of FELDER) {
      const n = Number(String(form[f.key] ?? '').replace(',', '.'));
      if (Number.isFinite(n)) z[f.key] = f.prozent ? n / 100 : n;
    }
    const res = await fetch('/api/admin/finanzen/ziele', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(z) });
    if (!res.ok) return toast.error('Speichern fehlgeschlagen');
    gespeichert((await res.json()).ziele);
    setForm(null);
  }

  return (
    <Card padding="none" className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-5 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Masterplan – Ist gegen Ziel im {monatName}</p>
          <p className="text-xs text-gray-500">
            {erreicht} von {zeilen.length} Zielen erreicht · Kunden-Kennzahlen: Direktvertrieb, aus den Lexware-Rechnungen
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setForm(Object.fromEntries(FELDER.map((f) => [f.key, String(f.prozent ? Math.round(ziele[f.key] * 100) : ziele[f.key])])))}
        >
          Ziele ändern
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <th className="px-5 py-2 text-left">Kennzahl</th>
              <th className="px-5 py-2 text-right">Ist</th>
              <th className="px-5 py-2 text-right">Ziel</th>
              <th className="px-5 py-2 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {zeilen.map((z) => (
              <tr key={z.key}>
                <td className="px-5 py-2 text-gray-900">{z.label}</td>
                <td className="px-5 py-2 text-right font-semibold text-gray-900">{wert(z.ist, z.format)}</td>
                <td className="px-5 py-2 text-right text-gray-500">
                  {z.hoeherBesser ? '≥ ' : '≤ '}
                  {wert(z.ziel, z.format)}
                </td>
                <td className="px-5 py-2 text-right">{z.erreicht == null ? '–' : z.erreicht ? '✅' : '🔴'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-gray-100 px-5 py-3 text-sm text-gray-700">
        Ø Umsatz je wiederkehrendem Kunden (LTV, Lexware): <span className="font-semibold">{kunden.ltvWiederkehrend ? euro(kunden.ltvWiederkehrend) : '–'}</span>
        {noetig ? (
          <>
            {' '}
            → für {euro(ziele.umsatzMonat)} im Monat braucht es eingeschwungen etwa <span className="font-semibold">{noetig} neue Daueraccounts pro Monat</span>.
          </>
        ) : null}
        <span className="block text-xs text-gray-500">
          {historie ? `Upsell-Quote aus der Kundenhistorie Direktvertrieb: ${historie.upsell} von ${historie.kunden} Kunden · ${historie.rueckgewinnung} Rückgewinnungen. ` : ''}
          {kunden.zahlend} zahlende Kunden im Monat · {kunden.neu} neu · {kunden.verloren} verloren. Lexware reicht erst bis Nov. 2023 zurück – lange Kunden wie Krüger zählen deshalb zu kurz.
        </span>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title="Ziele (Masterplan)" width="max-w-lg">
        {form && (
          <div className="grid grid-cols-2 gap-3">
            {FELDER.map((f) => (
              <label key={f.key} className="col-span-2 block sm:col-span-1">
                <span className="mb-1 block text-xs font-medium text-gray-600">{f.label}</span>
                <Input inputMode="decimal" value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
            <div className="col-span-2 mt-2 flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setForm(Object.fromEntries(FELDER.map((f) => [f.key, String(f.prozent ? Math.round(STANDARD_ZIELE[f.key] * 100) : STANDARD_ZIELE[f.key])])))}>
                Standard
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setForm(null)}>
                  Abbrechen
                </Button>
                <Button variant="primary" onClick={speichern}>
                  Speichern
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
