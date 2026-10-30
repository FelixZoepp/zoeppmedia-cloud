'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { berechneCashplan, endetBald, laufzeitEnde, monatKey, type FinanzVertrag } from '@/lib/finanzen/cashplan';

const euro = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const monatLabel = (m: string) => `${MONATE[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const ZEITRAUM = [6, 14, 24];

type Formular = {
  id?: string;
  kunde: string;
  monatlich: string;
  setup: string;
  setup_monat: string;
  start: string;
  laufzeit_monate: string;
  verlaengerung_monatlich: string;
  ust_satz: string;
  rechnungstag: string;
  status: FinanzVertrag['status'];
  angebot: string;
  notiz: string;
};

const leer = (): Formular => ({
  kunde: '',
  monatlich: '',
  setup: '0',
  setup_monat: '',
  start: monatKey(new Date()),
  laufzeit_monate: '',
  verlaengerung_monatlich: '',
  ust_satz: '19',
  rechnungstag: '1',
  status: 'aktiv',
  angebot: '',
  notiz: '',
});

type Vertrag = FinanzVertrag & { angebot: string | null };

function ausVertrag(v: Vertrag): Formular {
  const s = (x: number | null | undefined) => (x == null ? '' : String(x));
  return {
    id: v.id,
    kunde: v.kunde,
    monatlich: s(v.monatlich),
    setup: s(v.setup),
    setup_monat: v.setup_monat ? monatKey(v.setup_monat) : '',
    start: monatKey(v.start),
    laufzeit_monate: s(v.laufzeit_monate),
    verlaengerung_monatlich: s(v.verlaengerung_monatlich),
    ust_satz: s(v.ust_satz),
    rechnungstag: s(v.rechnungstag),
    status: v.status,
    angebot: v.angebot ?? '',
    notiz: v.notiz ?? '',
  };
}

const zahlOderNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

export function CashplanClient() {
  const [vertraege, setVertraege] = useState<Vertrag[] | null>(null);
  const [monate, setMonate] = useState(14);
  const [form, setForm] = useState<Formular | null>(null);
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    const res = await fetch('/api/admin/finanzen/vertraege', { cache: 'no-store' });
    if (!res.ok) return toast.error('Verträge konnten nicht geladen werden');
    const json = await res.json();
    // numeric kommt als String aus Postgres
    setVertraege(
      (json.vertraege as Record<string, unknown>[]).map((v) => ({
        ...(v as unknown as Vertrag),
        monatlich: Number(v.monatlich),
        setup: Number(v.setup),
        ust_satz: Number(v.ust_satz),
        verlaengerung_monatlich: v.verlaengerung_monatlich == null ? null : Number(v.verlaengerung_monatlich),
      })),
    );
  }, []);

  useEffect(() => {
    laden();
  }, [laden]);

  const jetzt = monatKey(new Date());
  const plan = useMemo(() => (vertraege ? berechneCashplan(vertraege, jetzt, monate) : []), [vertraege, jetzt, monate]);
  const bald = useMemo(() => (vertraege ? endetBald(vertraege, jetzt, 3) : []), [vertraege, jetzt]);

  async function speichern() {
    if (!form) return;
    if (!form.kunde.trim() || form.monatlich.trim() === '' || !form.start) return toast.error('Kunde, Monatsgebühr und Start ausfüllen');
    setBusy(true);
    const body = {
      kunde: form.kunde,
      monatlich: Number(form.monatlich.replace(',', '.')),
      setup: zahlOderNull(form.setup) ?? 0,
      setup_monat: form.setup_monat || null,
      start: form.start,
      laufzeit_monate: zahlOderNull(form.laufzeit_monate),
      verlaengerung_monatlich: zahlOderNull(form.verlaengerung_monatlich),
      ust_satz: zahlOderNull(form.ust_satz) ?? 19,
      rechnungstag: zahlOderNull(form.rechnungstag),
      status: form.status,
      angebot: form.angebot || null,
      notiz: form.notiz || null,
    };
    const res = await fetch(form.id ? `/api/admin/finanzen/vertraege/${form.id}` : '/api/admin/finanzen/vertraege', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) return toast.error('Speichern fehlgeschlagen');
    toast.success('Gespeichert');
    setForm(null);
    laden();
  }

  async function loeschen(v: Vertrag) {
    if (!confirm(`Vertrag „${v.kunde}“ wirklich löschen?`)) return;
    const res = await fetch(`/api/admin/finanzen/vertraege/${v.id}`, { method: 'DELETE' });
    if (!res.ok) return toast.error('Löschen fehlgeschlagen');
    laden();
  }

  if (!vertraege) {
    return (
      <div className="max-w-6xl">
        <PageHeader label="FINANZEN" title="Cash-Plan" description="Geldeingang je Monat aus allen Verträgen" />
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-600" />
        </div>
      </div>
    );
  }

  const dieser = plan[0];
  const summe = (k: 'gesamt' | 'brutto' | 'nurLaufzeit', n = plan.length) => plan.slice(0, n).reduce((s, m) => s + m[k], 0);
  const ustQuote = dieser && dieser.gesamt ? dieser.brutto / dieser.gesamt : 1.19;
  const aktive = vertraege.filter((v) => v.status !== 'beendet');

  return (
    <div className="max-w-6xl">
      <PageHeader
        label="FINANZEN"
        title="Cash-Plan"
        description="Geldeingang je Monat aus allen Verträgen – Monatsgebühren plus Setup, netto und brutto"
        counter={`${aktive.length} Verträge`}
        action={
          <Button size="sm" variant="primary" onClick={() => setForm(leer())}>
            <Plus className="h-3.5 w-3.5" />
            Vertrag
          </Button>
        }
      />

      {dieser && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi titel={`MRR ${monatLabel(dieser.monat)}`} netto={dieser.monatlich} brutto={dieser.monatlich * ustQuote} />
          <Kpi titel={`Cash ${monatLabel(dieser.monat)} (inkl. Setup)`} netto={dieser.gesamt} brutto={dieser.brutto} />
          <Kpi titel="Cash nächste 3 Monate" netto={summe('gesamt', 3)} brutto={summe('brutto', 3)} />
          <Kpi
            titel={`Cash ${monate} Monate`}
            netto={summe('gesamt')}
            brutto={summe('brutto')}
            note={`ohne Verlängerungen: ${euro(summe('nurLaufzeit'))} netto`}
          />
        </div>
      )}

      {bald.length > 0 && (
        <Card padding="md" className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Laufzeit endet in den nächsten 3 Monaten – Verlängerung klären</p>
          <div className="flex flex-wrap gap-2">
            {bald.map((v) => (
              <Badge key={v.id} tone="softAccent">
                {v.kunde} · {euro(v.monatlich)} · bis {monatLabel(laufzeitEnde(v)!)}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <Card padding="none" className="mb-8 overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <p className="text-sm font-semibold text-gray-900">Geldeingang je Monat</p>
          <div className="flex gap-1">
            {ZEITRAUM.map((z) => (
              <Button key={z} size="sm" variant={z === monate ? 'primary' : 'ghost'} onClick={() => setMonate(z)}>
                {z} Mon.
              </Button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3 text-left">Monat</th>
                <th className="px-5 py-3 text-right">Monatsgebühren</th>
                <th className="px-5 py-3 text-right">Setup</th>
                <th className="px-5 py-3 text-right">Netto gesamt</th>
                <th className="px-5 py-3 text-right">Brutto gesamt</th>
                <th className="px-5 py-3 text-right">Netto ohne Verlängerung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plan.map((m) => (
                <tr key={m.monat}>
                  <td className="whitespace-nowrap px-5 py-2.5 font-medium text-gray-900">{monatLabel(m.monat)}</td>
                  <td className="px-5 py-2.5 text-right text-gray-700">{euro(m.monatlich)}</td>
                  <td className="px-5 py-2.5 text-right text-gray-700">{m.setup ? euro(m.setup) : '–'}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{euro(m.gesamt)}</td>
                  <td className="px-5 py-2.5 text-right text-gray-700">{euro(m.brutto)}</td>
                  <td className="px-5 py-2.5 text-right text-gray-500">{euro(m.nurLaufzeit)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-5 py-3">Summe</td>
                <td className="px-5 py-3 text-right">{euro(plan.reduce((s, m) => s + m.monatlich, 0))}</td>
                <td className="px-5 py-3 text-right">{euro(plan.reduce((s, m) => s + m.setup, 0))}</td>
                <td className="px-5 py-3 text-right">{euro(summe('gesamt'))}</td>
                <td className="px-5 py-3 text-right">{euro(summe('brutto'))}</td>
                <td className="px-5 py-3 text-right text-gray-500">{euro(summe('nurLaufzeit'))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
          Brutto = netto + Umsatzsteuer je Vertrag (Verträge ohne USt, z. B. Ausland oder Kleinunternehmer, mit 0 %). Kosten sind nicht abgezogen.
        </p>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-3">
          <p className="text-sm font-semibold text-gray-900">Verträge</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3 text-left">Kunde</th>
                <th className="px-5 py-3 text-right">Monatlich</th>
                <th className="px-5 py-3 text-right">Setup</th>
                <th className="px-5 py-3 text-left">Start</th>
                <th className="px-5 py-3 text-left">Laufzeit</th>
                <th className="px-5 py-3 text-left">USt</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vertraege.map((v) => {
                const ende = laufzeitEnde(v);
                return (
                  <tr key={v.id} className={v.status === 'beendet' ? 'opacity-50' : ''}>
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-gray-900">{v.kunde}</p>
                      {(v.angebot || v.notiz) && <p className="text-xs text-gray-500">{[v.angebot, v.notiz].filter(Boolean).join(' · ')}</p>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right font-medium">{euro(v.monatlich)}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-gray-700">
                      {v.setup ? `${euro(v.setup)}${v.setup_monat && monatKey(v.setup_monat) !== monatKey(v.start) ? ` (${monatLabel(monatKey(v.setup_monat))})` : ''}` : '–'}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-gray-700">
                      {monatLabel(monatKey(v.start))}
                      {v.rechnungstag ? <span className="text-gray-400"> · zum {v.rechnungstag}.</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-gray-700">
                      {ende ? `${v.laufzeit_monate} Mon. bis ${monatLabel(ende)}` : 'unbefristet'}
                      {ende && v.verlaengerung_monatlich ? <span className="text-gray-400"> → {euro(v.verlaengerung_monatlich)}</span> : null}
                    </td>
                    <td className="px-5 py-2.5 text-gray-700">{v.ust_satz} %</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={v.status === 'aktiv' ? 'success' : v.status === 'startet' ? 'softAccent' : 'neutral'}>
                        {v.status === 'aktiv' ? 'Aktiv' : v.status === 'startet' ? 'Startet' : 'Beendet'}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right">
                      <button className="p-1.5 text-gray-400 hover:text-gray-700" aria-label="Bearbeiten" onClick={() => setForm(ausVertrag(v))}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="p-1.5 text-gray-400 hover:text-red-700" aria-label="Löschen" onClick={() => loeschen(v)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Vertrag bearbeiten' : 'Neuer Vertrag'} width="max-w-xl">
        {form && (
          <div className="grid grid-cols-2 gap-3">
            <Feld label="Kunde" breit>
              <Input value={form.kunde} onChange={(e) => setForm({ ...form, kunde: e.target.value })} />
            </Feld>
            <Feld label="Monatsgebühr netto (€)">
              <Input inputMode="decimal" value={form.monatlich} onChange={(e) => setForm({ ...form, monatlich: e.target.value })} />
            </Feld>
            <Feld label="Erster Monat">
              <Input type="month" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </Feld>
            <Feld label="Setup netto (€)">
              <Input inputMode="decimal" value={form.setup} onChange={(e) => setForm({ ...form, setup: e.target.value })} />
            </Feld>
            <Feld label="Setup im Monat (leer = Start)">
              <Input type="month" value={form.setup_monat} onChange={(e) => setForm({ ...form, setup_monat: e.target.value })} />
            </Feld>
            <Feld label="Laufzeit in Monaten (leer = unbefristet)">
              <Input inputMode="numeric" value={form.laufzeit_monate} onChange={(e) => setForm({ ...form, laufzeit_monate: e.target.value })} />
            </Feld>
            <Feld label="Danach monatlich (Verlängerung)">
              <Input inputMode="decimal" value={form.verlaengerung_monatlich} onChange={(e) => setForm({ ...form, verlaengerung_monatlich: e.target.value })} />
            </Feld>
            <Feld label="USt (%)">
              <Input inputMode="decimal" value={form.ust_satz} onChange={(e) => setForm({ ...form, ust_satz: e.target.value })} />
            </Feld>
            <Feld label="Rechnung zum (Tag)">
              <Input inputMode="numeric" value={form.rechnungstag} onChange={(e) => setForm({ ...form, rechnungstag: e.target.value })} />
            </Feld>
            <Feld label="Status">
              <select
                className="h-11 w-full rounded-[12px] bg-card px-3 text-[15px] shadow-[inset_0_0_0_1.5px_var(--hair)]"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as FinanzVertrag['status'] })}
              >
                <option value="aktiv">Aktiv</option>
                <option value="startet">Startet</option>
                <option value="beendet">Beendet</option>
              </select>
            </Feld>
            <Feld label="Angebot (z. B. AG0214)">
              <Input value={form.angebot} onChange={(e) => setForm({ ...form, angebot: e.target.value })} />
            </Feld>
            <Feld label="Notiz" breit>
              <Input value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} />
            </Feld>
            <div className="col-span-2 mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)}>
                Abbrechen
              </Button>
              <Button variant="primary" disabled={busy} onClick={speichern}>
                Speichern
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Kpi({ titel, netto, brutto, note }: { titel: string; netto: number; brutto: number; note?: string }) {
  return (
    <Card padding="md">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{titel}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{euro(netto)}</p>
      <p className="text-xs text-gray-500">netto · {euro(brutto)} brutto</p>
      {note && <p className="mt-1 text-xs text-gray-400">{note}</p>}
    </Card>
  );
}

function Feld({ label, breit, children }: { label: string; breit?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${breit ? 'col-span-2' : 'col-span-2 sm:col-span-1'}`}>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}
