'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import dynamic from 'next/dynamic';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { abschlussQuoten, istProMonat, kontaktIds, rechnungsCheck, rechnungsplan, zahlungsmoral, type FinanzRechnung } from '@/lib/finanzen/zahlungen';
import { gebuehrImMonat, setupImMonat, berechneCashplan, endetBald, laufzeitEnde, monatKey, monateAb, zahlungenImMonat, streitfallQuoten, vertragssumme, type FinanzVertrag } from '@/lib/finanzen/cashplan';

import { AusgabenBereich } from './ausgaben-bereich';
import { ZielTracker } from './ziel-tracker';
import { KpiUebersicht } from './kpi-uebersicht';
import { kpiListe } from '@/lib/finanzen/kpis';
import { STANDARD_ZIELE, kundenKennzahlen, type Ziele } from '@/lib/finanzen/ziele';
import { funnelQuoten, medianTageBisUpsell, type FunnelZahlen } from '@/lib/finanzen/prognose';
import { ausgabenImMonat, type Ausgabe, type Fixkosten } from '@/lib/finanzen/ausgaben';

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
  lex_contact_id: string;
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
  lex_contact_id: '',
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
    lex_contact_id: (v as Vertrag & { lex_contact_id?: string | null }).lex_contact_id ?? '',
  };
}

const zahlOderNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

interface Abgleich {
  am: string;
  rechnungen: number;
  rest: number;
}

async function holeRechnungen(): Promise<{ rechnungen: FinanzRechnung[]; abgleich: Abgleich | null } | null> {
  const res = await fetch('/api/admin/finanzen/rechnungen', { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

async function holeAusgaben(): Promise<{ ausgaben: Ausgabe[]; fixkosten: Fixkosten[] } | null> {
  const res = await fetch('/api/admin/finanzen/ausgaben', { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

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
  const [lex, setLex] = useState<{ rechnungen: FinanzRechnung[]; abgleich: Abgleich | null }>({ rechnungen: [], abgleich: null });
  const [gleichtAb, setGleichtAb] = useState(false);
  const [ziele, setZiele] = useState<Ziele>(STANDARD_ZIELE);
  const [d2dKontakte, setD2dKontakte] = useState<string[]>([]);
  const [funnel, setFunnel] = useState<(FunnelZahlen & { tage: number }) | null>(null);
  const [historie, setHistorie] = useState<{ kunden: number; upsell: number; rueckgewinnung: number } | null>(null);
  const [kosten, setKosten] = useState<{ ausgaben: Ausgabe[]; fixkosten: Fixkosten[] }>({ ausgaben: [], fixkosten: [] });

  const laden = useCallback(async () => {
    const [liste, r, k] = await Promise.all([holeVertraege(), holeRechnungen(), holeAusgaben()]);
    if (liste) setVertraege(liste);
    if (r) setLex(r);
    if (k) setKosten(k);
  }, []);

  useEffect(() => {
    let aktiv = true;
    fetch('/api/admin/finanzen/ziele', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((j) => {
        if (!aktiv || !j) return;
        if (j.ziele) setZiele(j.ziele);
        setHistorie(j.historie ?? null);
        setD2dKontakte(j.d2dKontakte ?? []);
        setFunnel(j.funnel ?? null);
      })
      .catch(() => {});
    Promise.all([holeVertraege(), holeRechnungen(), holeAusgaben()]).then(([liste, r, k]) => {
      if (!aktiv) return;
      if (liste) setVertraege(liste);
      if (r) setLex(r);
      if (k) setKosten(k);
    });
    return () => {
      aktiv = false;
    };
  }, []);

  async function abgleichen() {
    setGleichtAb(true);
    const res = await fetch('/api/admin/finanzen/lexware-abgleich', { method: 'POST' });
    setGleichtAb(false);
    const e = (await res.json().catch(() => null)) as { rechnungen?: number; details?: number; rest?: number; abgebrochen?: string } | null;
    if (!res.ok || !e) return toast.error('Abgleich fehlgeschlagen');
    if (e.abgebrochen) toast.message(e.abgebrochen);
    else toast.success(`${e.rechnungen} Rechnungen, ${e.details} Zahlungen geprüft${e.rest ? ` – noch ${e.rest} offen, einfach nochmal klicken` : ''}`);
    laden();
  }

  const jetzt = monatKey(new Date());
  const verlaufStart = monateAb(jetzt, 1).map((m) => {
    const [y, mm] = m.split('-').map(Number);
    const d = new Date(y, mm - 1 - VERLAUF_VOR, 1);
    return monatKey(d);
  })[0];
  // React Compiler memoisiert selbst
  const verlauf = vertraege ? berechneCashplan(vertraege, verlaufStart, VERLAUF_MONATE) : [];
  const [jahr, monatNr] = monat.split('-').map(Number);
  const vormonat = monatKey(new Date(jahr, monatNr - 2, 1));
  const folgemonat = monatKey(new Date(jahr, monatNr, 1));
  const diesMonat = vertraege ? berechneCashplan(vertraege, vormonat, 2) : [];
  const zahlungen = vertraege ? zahlungenImMonat(vertraege, monat) : [];
  const bald = vertraege ? endetBald(vertraege, monat, 3) : [];

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
      lex_contact_id: form.lex_contact_id || null,
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
  const ist = istProMonat(lex.rechnungen);
  const istMonat = ist.get(monat);
  const heute = new Date().toISOString().slice(0, 10);
  // Nur die letzten 12 Monate – ältere offene Posten in Lexware sind meist nur nicht als bezahlt verbucht
  const seit12 = `${Number(heute.slice(0, 4)) - 1}${heute.slice(4)}`;
  const moral = zahlungsmoral(lex.rechnungen, heute, seit12);
  const abschluss = abschlussQuoten(vertraege, lex.rechnungen);
  const kontakte = [...new Map(lex.rechnungen.filter((r) => r.contact_id).map((r) => [r.contact_id!, r.kontakt ?? r.contact_id!])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const betragImMonat = (v: FinanzVertrag, m: string) => gebuehrImMonat(v, m, false) + setupImMonat(v, m);
  const plan = rechnungsplan(vertraege, lex.rechnungen, monat, betragImMonat);
  const check = rechnungsCheck(vertraege, lex.rechnungen, jetzt, betragImMonat);
  // Starts nach Monat: Neukunde oder neuer Vertrag bei einem Bestandskunden (es gibt schon frühere Rechnungen)
  const starts = vertraege
    .filter((v) => v.status !== 'streitfall' && v.status !== 'beendet' && monatKey(v.start) >= jetzt)
    .map((v) => {
      const ids = new Set(kontaktIds(v));
      const bestand = lex.rechnungen.some((r) => r.contact_id && ids.has(r.contact_id) && (r.datum ?? '') < v.start.slice(0, 10) && r.status !== 'voided');
      return { v, bestand };
    })
    .sort((a, b) => a.v.start.localeCompare(b.v.start) || a.v.kunde.localeCompare(b.v.kunde));
  const startMonate = [...new Set(starts.map((x) => monatKey(x.v.start)))];
  // Upsell-Abschlüsse: Vertrag mit Abschlussdatum bei einem Kontakt, der vorher schon Rechnungen hatte
  const ersteRechnung = new Map<string, string>();
  for (const r of lex.rechnungen) if (r.contact_id && r.datum && r.status !== 'voided' && (!ersteRechnung.has(r.contact_id) || r.datum < ersteRechnung.get(r.contact_id)!)) ersteRechnung.set(r.contact_id, r.datum);
  const tageBisUpsellListe = vertraege.flatMap((v) => {
    if (!v.abschluss_am) return [];
    const erste = kontaktIds(v).map((id) => ersteRechnung.get(id)).filter((d): d is string => !!d && d < v.abschluss_am!.slice(0, 10)).sort()[0];
    return erste ? [Math.round((Date.parse(v.abschluss_am) - Date.parse(erste)) / 864e5)] : [];
  });
  const tageBisUpsell = medianTageBisUpsell(tageBisUpsellListe);
  const upsells30 = vertraege.filter((v) => {
    if (!v.abschluss_am || Date.parse(v.abschluss_am) < Date.parse(heute) - 30 * 864e5) return false;
    const ids = new Set(kontaktIds(v));
    return lex.rechnungen.some((r) => r.contact_id && ids.has(r.contact_id) && (r.datum ?? '') < v.abschluss_am!);
  }).length;
  // Startquote: Abschlüsse älter als 30 Tage (ohne Streitfälle) mit Zahlung danach
  const reif = vertraege.filter((v) => v.abschluss_am && v.status !== 'streitfall' && Date.parse(v.abschluss_am) < Date.parse(heute) - 30 * 864e5);
  const startQ = abschlussQuoten(reif, lex.rechnungen);
  const startquote = startQ.mitErstemGeld + startQ.ohneZahlung.length ? startQ.mitErstemGeld / (startQ.mitErstemGeld + startQ.ohneZahlung.length) : null;
  const fq = funnel ? funnelQuoten({ ...funnel, upsells: upsells30 }) : null;
  const ausgMonat = ausgabenImMonat(kosten.ausgaben, kosten.fixkosten, monat);
  const werbungMonat = ausgMonat.proKategorie.find((k) => k.kategorie === 'Werbung')?.betrag ?? 0;
  const d2dKunden = kundenKennzahlen(d2dKontakte.length ? lex.rechnungen.filter((r) => d2dKontakte.includes(r.kontakt ?? '')) : lex.rechnungen, monat);
  const kpis = kpiListe({
    kostenProLead: fq?.kostenProLead ?? null,
    showSetting: fq?.showSetting ?? null,
    settingZuClosing: fq?.settingZuClosing ?? null,
    showClosing: fq?.showClosing ?? null,
    closingQuote: fq?.closingQuote ?? null,
    upsellQuote: historie ? historie.upsell / historie.kunden : d2dKunden.upsellQuote,
    tageBisUpsell,
    startquote,
    tageBisErstesGeld: abschluss.tageBisErstesGeld,
    churn: d2dKunden.churn,
    rueckgewinnungen: historie?.rueckgewinnung ?? null,
    marge: dieser && dieser.gesamt ? (dieser.gesamt - ausgMonat.gesamt) / dieser.gesamt : null,
    werbeanteil: dieser && dieser.monatlich ? werbungMonat / dieser.monatlich : null,
    tageBisZahlung: moral.tageBisZahlung,
    puenktlich: moral.puenktlich,
    ueberfaelligBrutto: moral.ueberfaelligBrutto,
    offeneRechnungenFehlen: check.luecken.length,
    kundenProKopf: ziele.fulfillmentKoepfe ? zahlungen.length / ziele.fulfillmentKoepfe : null,
    zielKundenProKopf: ziele.kundenProKopf,
  });
  const verlaufMitIst = verlauf.map((m) => ({
    ...m,
    ist: m.monat <= jetzt ? (ist.get(m.monat)?.netto ?? 0) : undefined,
    ausgaben: ausgabenImMonat(kosten.ausgaben, kosten.fixkosten, m.monat).gesamt || undefined,
  }));
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
            {monat <= jetzt && (
              <p className="mt-3 border-t border-gray-100 pt-2 text-sm text-gray-700">
                Tatsächlich eingegangen (Lexware): <span className="font-semibold">{euro(istMonat?.netto ?? 0)}</span> netto ·{' '}
                {euro(istMonat?.brutto ?? 0)} brutto
                {istMonat ? <span className="text-gray-400"> · {istMonat.anzahl} Zahlungen</span> : null}
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

      {dieser && <KpiUebersicht kpis={kpis} />}

      {dieser && (
        <ZielTracker
          monatName={monatLang(monat)}
          ziele={ziele}
          einnahmen={dieser.gesamt}
          monatsgebuehren={dieser.monatlich}
          ueberschuss={dieser.gesamt - ausgabenImMonat(kosten.ausgaben, kosten.fixkosten, monat).gesamt}
          werbung={ausgabenImMonat(kosten.ausgaben, kosten.fixkosten, monat).proKategorie.find((k) => k.kategorie === 'Werbung')?.betrag ?? 0}
          aktiveVertraege={zahlungen.length}
          kunden={{ ...kundenKennzahlen(d2dKontakte.length ? lex.rechnungen.filter((r) => d2dKontakte.includes(r.kontakt ?? '')) : lex.rechnungen, monat), ...(historie ? { upsellQuote: historie.upsell / historie.kunden } : {}) }}
          historie={historie}
          hochlaufDaten={{
            abMonat: jetzt,
            startMrr: berechneCashplan(vertraege, jetzt, 1)[0]?.monatlich ?? 0,
            funnel,
            // Upsells der letzten 30 Tage: Abschluss bei einem Kontakt, der vorher schon Rechnungen hatte
            upsells: upsells30,
            upsellAbMonat: tageBisUpsell == null ? undefined : Math.max(1, Math.round(tageBisUpsell / 30)),
          }}
          gespeichert={setZiele}
        />
      )}

      {dieser && (
        <AusgabenBereich
          monat={monat}
          monatName={monatLang(monat)}
          einnahmenNetto={dieser.gesamt}
          einnahmenIst={monat <= jetzt ? (istMonat?.netto ?? 0) : null}
          umsatzsteuer={Math.max(0, dieser.brutto - dieser.gesamt)}
          ausgaben={kosten.ausgaben}
          fixkosten={kosten.fixkosten}
          neuLaden={laden}
        />
      )}

      {/* Starts nach Monat */}
      <Card padding="none" className="mb-6 overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-3">
          <p className="text-sm font-semibold text-gray-900">Starts nach Monat</p>
          <p className="text-xs text-gray-500">Wer wann startet – Neukunde oder neuer Vertrag bei einem Bestandskunden</p>
        </div>
        <div className="grid grid-cols-1 gap-0 divide-y divide-gray-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {startMonate.map((m) => {
            const liste = starts.filter((x) => monatKey(x.v.start) === m);
            const neu = liste.filter((x) => !x.bestand);
            return (
              <div key={m} className="px-5 py-4">
                <p className="text-sm font-bold capitalize text-gray-900">{monatLang(m)}</p>
                <p className="mb-2 text-xs text-gray-500">
                  {neu.length} Neukunden · {liste.length - neu.length} neue Verträge Bestand · {euro(liste.reduce((s, x) => s + x.v.monatlich, 0))}/Monat ·{' '}
                  {euro(liste.reduce((s, x) => s + x.v.setup, 0))} Setup
                </p>
                <ul className="space-y-1 text-sm">
                  {liste.map(({ v, bestand }) => (
                    <li key={v.id} className="flex items-center justify-between gap-2">
                      <span className="text-gray-900">
                        {v.kunde}
                        {bestand && <span className="ml-1 text-xs text-gray-400">(Bestand)</span>}
                        {v.status === 'startet' && <span className="ml-1 text-xs text-amber-700">noch nicht gestartet</span>}
                      </span>
                      <span className="whitespace-nowrap text-gray-600">
                        {euro(v.monatlich)}
                        {v.setup ? ` + ${euro(v.setup)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Rechnungen: wer bekommt wann was – und was wurde vergessen */}
      <Card padding="none" className="mb-6 overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-3">
          <p className="text-sm font-semibold text-gray-900">Rechnungen im {monatLang(monat)}</p>
          <p className="text-xs text-gray-500">
            Wer wann welche Rechnung bekommt – abgeglichen mit Lexware ({plan.filter((p) => p.geschrieben).length} von {plan.length} geschrieben)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {plan.map((p) => (
                <tr key={p.vertrag.id}>
                  <td className="whitespace-nowrap px-5 py-2 text-gray-600">{new Date(`${p.datum}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</td>
                  <td className="px-5 py-2 font-medium text-gray-900">{p.vertrag.kunde}</td>
                  <td className="whitespace-nowrap px-5 py-2 text-right text-gray-700">{euro(p.netto)} netto</td>
                  <td className="whitespace-nowrap px-5 py-2 text-right">
                    {p.geschrieben ? (
                      <Badge tone="success">Geschrieben</Badge>
                    ) : kontaktIds(p.vertrag).length ? (
                      <Badge tone="softAccent">{p.datum <= heute ? 'Fehlt' : 'Noch offen'}</Badge>
                    ) : (
                      <Badge tone="neutral">Kein Lexware-Kontakt</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {check.luecken.length > 0 && (
          <div className="border-t border-gray-200 px-5 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-700">
              Möglicherweise vergessene Rechnungen bis heute: {euro(check.fehltGesamt)} netto
            </p>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {check.luecken.map((l) => (
                  <tr key={`${l.vertrag.id}-${l.monat}`}>
                    <td className="py-1.5 text-gray-900">{l.vertrag.kunde}</td>
                    <td className="py-1.5 text-gray-600">{monatLabel(l.monat)}</td>
                    <td className="py-1.5 text-right text-gray-500">
                      erwartet {euro(l.erwartet)} · geschrieben {euro(l.gestellt)}
                    </td>
                    <td className="py-1.5 text-right font-semibold text-red-700">{euro(l.fehlt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-500">
              Grundlage: Monatsgebühr und Setup laut Vertrag gegen die Lexware-Rechnungen des Kontakts im selben Monat (vorab im Vormonat geschriebene zählen mit). Stimmt der Vertrag nicht, dort korrigieren.
            </p>
          </div>
        )}
        {check.nichtZugeordnet.length > 0 && (
          <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
            Ohne Lexware-Kontakt (nicht prüfbar): {check.nichtZugeordnet.map((v) => v.kunde).join(', ')} – über den Stift zuordnen.
          </p>
        )}
      </Card>

      {/* Entwicklung */}
      <Card padding="md" className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-sm font-semibold text-gray-900">Entwicklung Geldeingang (netto)</p>
          <p className="text-xs text-gray-500">Balken anklicken, um den Monat zu öffnen</p>
        </div>
        <div className="h-72">
          <CashplanChart daten={verlaufMitIst} gewaehlt={monat} onWahl={setMonat} />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Gestrichelt: Geldeingang, wenn niemand verlängert. Gerechnet nach Rechnungsmonat; Kosten sind nicht abgezogen.
        </p>
      </Card>

      {/* Zahlungsmoral & Abschlüsse */}
      <Card padding="none" className="mb-8 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-5 py-3">
          <p className="text-sm font-semibold text-gray-900">Zahlungsmoral & Abschlüsse</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {lex.abgleich
                ? `Lexware: ${lex.abgleich.rechnungen} Rechnungen, Stand ${new Date(lex.abgleich.am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}${lex.abgleich.rest ? ` · ${lex.abgleich.rest} Zahlungen noch nicht geprüft` : ''}`
                : 'Noch kein Abgleich mit Lexware'}
            </span>
            <Button size="sm" variant="secondary" disabled={gleichtAb} onClick={abgleichen}>
              {gleichtAb ? 'Gleicht ab …' : 'Mit Lexware abgleichen'}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 border-b border-gray-100 px-5 py-4 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Ø Tage bis Zahlung</p>
            <p className="text-2xl font-bold text-gray-900">{moral.tageBisZahlung ?? '–'}</p>
            <p className="text-xs text-gray-500">ab Rechnungsdatum · {moral.bezahlteRechnungen} bezahlte Rechnungen</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Pünktlich bezahlt</p>
            <p className="text-2xl font-bold text-gray-900">{moral.puenktlich == null ? '–' : prozent(moral.puenktlich)}</p>
            <p className="text-xs text-gray-500">bis zur Fälligkeit</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Offen (12 Monate)</p>
            <p className="text-2xl font-bold text-gray-900">{euro(moral.offenBrutto)}</p>
            <p className="text-xs text-gray-500">brutto · {moral.offenAnzahl} Rechnungen</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Überfällig (12 Monate)</p>
            <p className="text-2xl font-bold text-red-700">{euro(moral.ueberfaelligBrutto)}</p>
            <p className="text-xs text-gray-500">brutto · {moral.ueberfaellig.length} Rechnungen</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 px-5 py-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Abschlüsse je Monat</p>
            {abschluss.proMonat.length === 0 ? (
              <p className="text-sm text-gray-400">Noch keine Abschlussdaten an den Verträgen.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {abschluss.proMonat.slice(-8).map((m) => (
                    <tr key={m.monat}>
                      <td className="py-1.5 text-gray-700">{monatLabel(m.monat)}</td>
                      <td className="py-1.5 text-right font-semibold text-gray-900">{m.abschluesse} Abschlüsse</td>
                      <td className="py-1.5 text-right text-gray-500">{m.streitfaelle ? `${m.streitfaelle} Streitfall` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-sm text-gray-700">
              Ø vom Abschluss bis zum ersten Geld:{' '}
              <span className="font-semibold">{abschluss.tageBisErstesGeld == null ? '–' : `${abschluss.tageBisErstesGeld} Tage`}</span>
              <span className="text-gray-400"> ({abschluss.mitErstemGeld} Kunden mit Zahlung)</span>
            </p>
            {abschluss.ohneZahlung.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">Noch kein Geld seit Abschluss: {abschluss.ohneZahlung.map((v) => v.kunde).join(', ')}</p>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Überfällige Rechnungen</p>
            {moral.ueberfaellig.length === 0 ? (
              <p className="text-sm text-gray-400">Keine überfälligen Rechnungen.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {moral.ueberfaellig.slice(0, 10).map((r) => (
                    <tr key={r.voucher_id}>
                      <td className="py-1.5 text-gray-900">{r.kontakt ?? '–'}</td>
                      <td className="py-1.5 text-gray-500">{r.nummer}</td>
                      <td className="py-1.5 text-gray-500">fällig {r.faellig ? new Date(`${r.faellig}T12:00:00`).toLocaleDateString('de-DE') : '–'}</td>
                      <td className="py-1.5 text-right font-semibold text-red-700">{euro(r.offen ?? r.brutto ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
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
            <Feld label="Lexware-Kontakte (mehrere möglich: Cmd/Strg + Klick)" breit>
              <select
                multiple
                className="h-28 w-full rounded-[12px] bg-card px-3 py-2 text-[15px] shadow-[inset_0_0_0_1.5px_var(--hair)]"
                value={form.lex_contact_id.split(',').filter(Boolean)}
                onChange={(e) => setForm({ ...form, lex_contact_id: [...e.target.selectedOptions].map((o) => o.value).join(',') })}
              >
                {kontakte.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
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
