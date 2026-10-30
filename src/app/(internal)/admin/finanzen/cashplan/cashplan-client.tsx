'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import dynamic from 'next/dynamic';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { berechneCashplan, endetBald, laufzeitEnde, monatKey, monateAb, zahlungenImMonat, streitfallQuoten, vertragssumme, type FinanzVertrag } from '@/lib/finanzen/cashplan';

const CashplanChart = dynamic(() => import('./cashplan-chart').then((m) => m.CashplanChart), { ssr: false });

const euro = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const monatLabel = (m: string) => `${MONATE[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const monatLang = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
/** Verlauf im Diagramm: 2 Monate zurück, 12 nach vorn */
const VERLAUF_VOR = 2;
const VERLAUF_MONATE = 15;

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
  abschluss_am: string;
  offen_betrag: string;
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
  abschluss_am: '',
  offen_betrag: '',
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
    abschluss_am: v.abschluss_am ?? '',
    offen_betrag: s(v.offen_betrag),
  };
}

const zahlOderNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

async function holeVertraege(): Promise<Vertrag[] | null> {
  const res = await fetch('/api/admin/finanzen/vertraege', { cache: 'no-store' });
  if (!res.ok) {
    toast.error('Verträge konnten nicht geladen werden');
    return null;
  }
  const json = await res.json();
  // numeric kommt als String aus Postgres
  return (json.vertraege as Record<string, unknown>[]).map((v) => ({
    ...(v as unknown as Vertrag),
    monatlich: Number(v.monatlich),
    setup: Number(v.setup),
    ust_satz: Number(v.ust_satz),
    verlaengerung_monatlich: v.verlaengerung_monatlich == null ? null : Number(v.verlaengerung_monatlich),
    offen_betrag: v.offen_betrag == null ? null : Number(v.offen_betrag),
  }));
}

export function CashplanClient() {
  const [vertraege, setVertraege] = useState<Vertrag[] | null>(null);
  const [monat, setMonat] = useState(() => monatKey(new Date()));
  const [vertraegeOffen, setVertraegeOffen] = useState(false);
  const [form, setForm] = useState<Formular | null>(null);
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    const liste = await holeVertraege();
    if (liste) setVertraege(liste);
  }, []);

  useEffect(() => {
    let aktiv = true;
    holeVertraege().then((liste) => aktiv && liste && setVertraege(liste));
    return () => {
      aktiv = false;
    };
  }, []);

  const jetzt = monatKey(new Date());
  const verlaufStart = monateAb(jetzt, 1).map((m) => {
    const [y, mm] = m.split('-').map(Number);
    const d = new Date(y, mm - 1 - VERLAUF_VOR, 1);
    return monatKey(d);
  })[0];
  const verlauf = useMemo(() => (vertraege ? berechneCashplan(vertraege, verlaufStart, VERLAUF_MONATE) : []), [vertraege, verlaufStart]);
  const [vormonat, folgemonat] = useMemo(() => {
    const [y, m] = monat.split('-').map(Number);
    return [monatKey(new Date(y, m - 2, 1)), monatKey(new Date(y, m, 1))];
  }, [monat]);
  const diesMonat = useMemo(() => (vertraege ? berechneCashplan(vertraege, vormonat, 2) : []), [vertraege, vormonat]);
  const zahlungen = useMemo(() => (vertraege ? zahlungenImMonat(vertraege, monat) : []), [vertraege, monat]);
  const bald = useMemo(() => (vertraege ? endetBald(vertraege, monat, 3) : []), [vertraege, monat]);

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
      abschluss_am: form.abschluss_am || null,
      offen_betrag: zahlOderNull(form.offen_betrag),
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

  const [vor, dieser] = diesMonat;
  const aktive = vertraege.filter((v) => v.status !== 'beendet' && v.status !== 'streitfall');
  const diff = dieser && vor ? dieser.gesamt - vor.gesamt : 0;
  const neue = zahlungen.filter((z) => z.neu);
  const letzte = zahlungen.filter((z) => z.letzter);
  const zahlendeIds = new Set(zahlungen.map((z) => z.vertrag.id));
  const streitfaelle = vertraege.filter((v) => v.status === 'streitfall');
  const uebrige = vertraege.filter((v) => !zahlendeIds.has(v.id) && v.status !== 'streitfall');
  const quoten = streitfallQuoten(vertraege);
  const prozent = (x: number) => `${Math.round(x * 100)} %`;

  return (
    <div className="max-w-6xl">
      <PageHeader
        label="FINANZEN"
        title="Cash-Plan"
        description="Was in einem Monat wirklich reinkommt – Monatsgebühren plus Setup, netto und brutto"
        counter={`${aktive.length} Verträge`}
        action={
          <Button size="sm" variant="primary" onClick={() => setForm(leer())}>
            <Plus className="h-3.5 w-3.5" />
            Vertrag
          </Button>
        }
      />

      {/* Monat wählen */}
      <div className="mb-4 flex items-center gap-2">
        <button className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label="Vormonat" onClick={() => setMonat(vormonat)}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="min-w-[200px] text-center text-xl font-bold capitalize text-gray-900">{monatLang(monat)}</h2>
        <button className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label="Folgemonat" onClick={() => setMonat(folgemonat)}>
          <ChevronRight className="h-5 w-5" />
        </button>
        {monat !== jetzt && (
          <Button size="sm" variant="ghost" onClick={() => setMonat(jetzt)}>
            Aktueller Monat
          </Button>
        )}
      </div>

      {dieser && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card padding="md" className="sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Geldeingang im Monat</p>
            <p className="mt-1 text-4xl font-bold text-gray-900">{euro(dieser.gesamt)}</p>
            <p className="mt-1 text-sm text-gray-600">
              netto · <span className="font-semibold">{euro(dieser.brutto)}</span> brutto
            </p>
            {vor && (
              <p className={`mt-2 text-xs ${diff >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {diff >= 0 ? '+' : ''}
                {euro(diff)} zum Vormonat
              </p>
            )}
          </Card>
          <Kpi titel="Monatsgebühren (MRR)" netto={dieser.monatlich} brutto={zahlungen.reduce((s, z) => s + z.gebuehr * (1 + z.vertrag.ust_satz / 100), 0)} />
          <Kpi
            titel="Setup-Gebühren"
            netto={dieser.setup}
            brutto={zahlungen.reduce((s, z) => s + z.setup * (1 + z.vertrag.ust_satz / 100), 0)}
            note={`${zahlungen.length} zahlende Kunden${neue.length ? ` · ${neue.length} neu` : ''}`}
          />
        </div>
      )}

      {/* Wer zahlt in diesem Monat */}
      <Card padding="none" className="mb-6 overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-3">
          <p className="text-sm font-semibold text-gray-900">Aktive Verträge im {monatLang(monat)} ({zahlungen.length})</p>
        </div>
        {zahlungen.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">In diesem Monat ist nichts eingeplant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3 text-left">Kunde</th>
                  <th className="px-5 py-3 text-left">Rechnung</th>
                  <th className="px-5 py-3 text-left">Laufzeit</th>
                  <th className="px-5 py-3 text-right">Monatsgebühr</th>
                  <th className="px-5 py-3 text-right">Setup</th>
                  <th className="px-5 py-3 text-right">Netto</th>
                  <th className="px-5 py-3 text-right">Brutto</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {zahlungen.map((z) => (
                  <tr key={z.vertrag.id}>
                    <td className="px-5 py-2.5">
                      <span className="font-medium text-gray-900">{z.vertrag.kunde}</span>
                      <span className="ml-2 inline-flex gap-1 align-middle">
                        {z.neu && <Badge tone="success">Neu</Badge>}
                        {z.letzter && <Badge tone="softAccent">Letzter Monat</Badge>}
                        {z.verlaengert && <Badge tone="outline">Verlängerung angenommen</Badge>}
                        {z.vertrag.status === 'startet' && <Badge tone="softAccent">Startet</Badge>}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-gray-600">{z.vertrag.rechnungstag ? `zum ${z.vertrag.rechnungstag}.` : '–'}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-gray-600">
                      {laufzeitEnde(z.vertrag) ? `seit ${monatLabel(monatKey(z.vertrag.start))} · bis ${monatLabel(laufzeitEnde(z.vertrag)!)}` : `seit ${monatLabel(monatKey(z.vertrag.start))} · unbefristet`}
                      {laufzeitEnde(z.vertrag) && z.vertrag.verlaengerung_monatlich ? <span className="text-gray-400"> → {euro(z.vertrag.verlaengerung_monatlich)}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-gray-700">{z.gebuehr ? euro(z.gebuehr) : '–'}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-gray-700">{z.setup ? euro(z.setup) : '–'}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right font-semibold text-gray-900">{euro(z.netto)}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-gray-600">
                      {euro(z.brutto)}
                      {z.vertrag.ust_satz === 0 && <span className="ml-1 text-xs text-gray-400">(0 % USt)</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <button className="p-1.5 text-gray-400 hover:text-gray-700" aria-label="Bearbeiten" onClick={() => setForm(ausVertrag(z.vertrag as Vertrag))}>
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-5 py-3" colSpan={3}>
                    Summe
                  </td>
                  <td className="px-5 py-3 text-right">{euro(zahlungen.reduce((s, z) => s + z.gebuehr, 0))}</td>
                  <td className="px-5 py-3 text-right">{euro(zahlungen.reduce((s, z) => s + z.setup, 0))}</td>
                  <td className="px-5 py-3 text-right">{euro(zahlungen.reduce((s, z) => s + z.netto, 0))}</td>
                  <td className="px-5 py-3 text-right">{euro(zahlungen.reduce((s, z) => s + z.brutto, 0))}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {(letzte.length > 0 || bald.length > 0) && (
          <div className="border-t border-gray-100 px-5 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Laufzeit endet bald – Verlängerung klären</p>
            <div className="flex flex-wrap gap-2">
              {bald.map((v) => (
                <Badge key={v.id} tone="softAccent">
                  {v.kunde} · {euro(v.monatlich)} · bis {monatLabel(laufzeitEnde(v)!)}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Entwicklung */}
      <Card padding="md" className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-sm font-semibold text-gray-900">Entwicklung Geldeingang (netto)</p>
          <p className="text-xs text-gray-500">Balken anklicken, um den Monat zu öffnen</p>
        </div>
        <div className="h-72">
          <CashplanChart daten={verlauf} gewaehlt={monat} onWahl={setMonat} />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Gestrichelt: Geldeingang, wenn niemand verlängert. Gerechnet nach Rechnungsmonat; Kosten sind nicht abgezogen.
        </p>
      </Card>

      {/* Streitfälle */}
      <Card padding="none" className="mb-8 overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-3">
          <p className="text-sm font-semibold text-gray-900">Streitfälle – abgeschlossen, zahlen nicht ({streitfaelle.length})</p>
        </div>
        <div className="grid grid-cols-2 gap-4 border-b border-gray-100 px-5 py-4 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Offen</p>
            <p className="text-2xl font-bold text-red-700">{euro(quoten.offen)}</p>
            <p className="text-xs text-gray-500">netto · {euro(quoten.offenBrutto)} brutto</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Abschlüsse gesamt</p>
            <p className="text-2xl font-bold text-gray-900">{quoten.abschluesse}</p>
            <p className="text-xs text-gray-500">Vertragsvolumen {euro(quoten.volumen)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Streitfall-Quote</p>
            <p className="text-2xl font-bold text-gray-900">{prozent(quoten.quoteAnzahl)}</p>
            <p className="text-xs text-gray-500">
              {quoten.streitfaelle} von {quoten.abschluesse} Abschlüssen
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Anteil am Volumen</p>
            <p className="text-2xl font-bold text-gray-900">{prozent(quoten.quoteVolumen)}</p>
            <p className="text-xs text-gray-500">{euro(quoten.volumenStreit)} Vertragssumme in Streit</p>
          </div>
        </div>
        {streitfaelle.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3 text-left">Kunde</th>
                  <th className="px-5 py-3 text-left">Abschluss</th>
                  <th className="px-5 py-3 text-right">pro Monat</th>
                  <th className="px-5 py-3 text-right">Vertragssumme</th>
                  <th className="px-5 py-3 text-right">Offen netto</th>
                  <th className="px-5 py-3 text-right">Offen brutto</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...streitfaelle]
                  .sort((a, b) => (b.offen_betrag ?? vertragssumme(b)) - (a.offen_betrag ?? vertragssumme(a)))
                  .map((v) => {
                    const offen = v.offen_betrag ?? vertragssumme(v);
                    return (
                      <tr key={v.id}>
                        <td className="px-5 py-2.5">
                          <p className="font-medium text-gray-900">{v.kunde}</p>
                          {(v.angebot || v.notiz) && <p className="text-xs text-gray-500">{[v.angebot, v.notiz].filter(Boolean).join(' · ')}</p>}
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-gray-600">
                          {v.abschluss_am ? new Date(`${v.abschluss_am}T12:00:00`).toLocaleDateString('de-DE') : '–'}
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-right text-gray-700">{v.monatlich ? euro(v.monatlich) : '–'}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-right text-gray-700">{euro(vertragssumme(v))}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-right font-semibold text-red-700">
                          {euro(offen)}
                          {v.offen_betrag == null && <span className="ml-1 text-xs font-normal text-gray-400">(geschätzt)</span>}
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-right text-gray-600">{euro(offen * (1 + v.ust_satz / 100))}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          <button className="p-1.5 text-gray-400 hover:text-gray-700" aria-label="Bearbeiten" onClick={() => setForm(ausVertrag(v))}>
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
          Streitfälle zählen nicht in den Geldeingang. „Geschätzt“ = kein offener Betrag eingetragen, es zählt die ganze Vertragssumme.
        </p>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <button className="flex w-full items-center justify-between border-b border-gray-200 px-5 py-3 text-left" onClick={() => setVertraegeOffen(!vertraegeOffen)}>
          <span className="text-sm font-semibold text-gray-900">Weitere Verträge – starten später oder beendet ({uebrige.length})</span>
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${vertraegeOffen ? 'rotate-180' : ''}`} />
        </button>
        {vertraegeOffen && (
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
              {uebrige.map((v) => {
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
                        {v.status === 'aktiv' ? 'Aktiv' : v.status === 'startet' ? 'Startet' : v.status === 'streitfall' ? 'Streitfall' : 'Beendet'}
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
        )}
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
                <option value="streitfall">Streitfall</option>
              </select>
            </Feld>
            <Feld label="Angebot (z. B. AG0214)">
              <Input value={form.angebot} onChange={(e) => setForm({ ...form, angebot: e.target.value })} />
            </Feld>
            {form.status === 'streitfall' && (
              <>
                <Feld label="Abschluss am">
                  <Input type="date" value={form.abschluss_am} onChange={(e) => setForm({ ...form, abschluss_am: e.target.value })} />
                </Feld>
                <Feld label="Offen netto (€)">
                  <Input inputMode="decimal" value={form.offen_betrag} onChange={(e) => setForm({ ...form, offen_betrag: e.target.value })} />
                </Feld>
              </>
            )}
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
