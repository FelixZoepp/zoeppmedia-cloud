'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Lightbulb, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { MahnwesenTab, type MahnDaten } from './mahnwesen-tab';

interface Zeile {
  agency_id: string; name: string; typ: 'setup' | 'retainer'; periode: string; faellig_am: string;
  betrag_netto: number | null; geschrieben_am: string | null; rechnungsnummer: string | null;
}
interface Fehlend {
  id: string; name: string; vertragsstart: string | null; mrr: number | null; setup_betrag: number | null; lex_contact_id: string | null;
  vorschlag: { contactId: string; contactName: string; letzteRechnung: string; ersteRechnung: string; letzterBetragBrutto: number; anzahl: number } | null;
}
interface Daten {
  monat: string; rechnungen: Zeile[]; fehlend: Fehlend[];
  mahn: MahnDaten;
}

const euro = (n: number | null) => (n == null ? '–' : `${Number(n).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`);
const datum = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '–');
const inputCls = 'h-9 rounded-lg border border-gray-300 bg-white px-2.5 text-sm';

function monatPlus(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function RechnungRow({ z, onDone }: { z: Zeile; onDone: (nr: string) => Promise<void> }) {
  const [nr, setNr] = useState('');
  const ueberfaellig = !z.geschrieben_am && z.faellig_am < new Date().toISOString().slice(0, 10);
  return (
    <div className={`flex flex-wrap items-center gap-3 py-2.5 ${z.geschrieben_am ? 'opacity-60' : ''}`}>
      <span className={`w-14 text-sm font-semibold ${ueberfaellig ? 'text-red-600' : 'text-gray-700'}`}>{datum(z.faellig_am)}</span>
      <span className="flex-1 min-w-[160px] text-sm font-medium text-gray-900">{z.name}</span>
      <span className={`text-[11px] px-1.5 py-0.5 rounded ${z.typ === 'setup' ? 'bg-yellow-50 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>
        {z.typ === 'setup' ? 'Einrichtungsgebühr' : 'Retainer'}
      </span>
      <span className="w-24 text-right text-sm text-gray-700">{euro(z.betrag_netto)} netto</span>
      {z.geschrieben_am ? (
        <span className="text-xs text-green-700 inline-flex items-center gap-1 w-48">
          <Check className="w-3.5 h-3.5" /> geschrieben {z.rechnungsnummer ?? ''}
        </span>
      ) : (
        <span className="flex gap-2 w-48">
          <input className={`${inputCls} w-24`} placeholder="RE-Nr." value={nr} onChange={(e) => setNr(e.target.value)} />
          <button onClick={() => onDone(nr)} className="h-9 px-3 rounded-full bg-gradient-to-b from-red-700 to-red-950 text-white text-xs font-semibold">Geschrieben</button>
        </span>
      )}
    </div>
  );
}

function FehlendRow({ a, onSave }: { a: Fehlend; onSave: (p: Record<string, unknown>) => Promise<void> }) {
  const [f, setF] = useState({ vertragsstart: a.vertragsstart ?? '', mrr: a.mrr?.toString() ?? '', setup_betrag: a.setup_betrag?.toString() ?? '' });
  const v = a.vorschlag;
  return (
    <div className="py-3 space-y-2">
      <p className="text-sm font-semibold text-gray-900">{a.name}</p>
      {v && (
        <div className="text-xs rounded-lg bg-sky-50 text-sky-900 px-3 py-2 flex flex-wrap items-center gap-2">
          <Lightbulb className="w-3.5 h-3.5" />
          Lexoffice: <strong>{v.contactName}</strong> · {v.anzahl} Rechnungen · erste {datum(v.ersteRechnung)} · letzte {datum(v.letzteRechnung)} über {euro(v.letzterBetragBrutto)} brutto
          {!a.lex_contact_id && (
            <button
              onClick={() => onSave({ lex_contact_id: v.contactId, ...(f.vertragsstart ? {} : { vertragsstart: v.ersteRechnung }) })}
              className="ml-auto h-7 px-2.5 rounded-md bg-sky-600 text-white font-semibold"
            >
              Kontakt übernehmen
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center text-xs text-gray-600">
        <label className="flex items-center gap-1.5">Vertragsstart <input type="date" className={inputCls} value={f.vertragsstart} onChange={(e) => setF({ ...f, vertragsstart: e.target.value })} /></label>
        <label className="flex items-center gap-1.5">Retainer netto <input className={`${inputCls} w-24`} value={f.mrr} onChange={(e) => setF({ ...f, mrr: e.target.value })} placeholder="€" /></label>
        <label className="flex items-center gap-1.5">Einrichtung netto <input className={`${inputCls} w-24`} value={f.setup_betrag} onChange={(e) => setF({ ...f, setup_betrag: e.target.value })} placeholder="€" /></label>
        <button
          onClick={() => onSave({
            vertragsstart: f.vertragsstart,
            mrr: f.mrr ? Number(f.mrr.replace(',', '.')) : '',
            setup_betrag: f.setup_betrag ? Number(f.setup_betrag.replace(',', '.')) : '',
          })}
          className="h-9 px-3 rounded-lg border border-gray-300 bg-white font-semibold"
        >
          Speichern
        </button>
      </div>
    </div>
  );
}

export default function BuchhaltungPage() {
  const [tab, setTab] = useState<'rechnungen' | 'vertragsdaten' | 'mahnwesen'>('rechnungen');
  const [monat, setMonat] = useState(() => new Date().toISOString().slice(0, 7));
  const [d, setD] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fallId, setFallId] = useState<string | null>(null);

  // Link aus einer Aufgabe: /buchhaltung?fall=<id> bzw. ?tab=mahnwesen
  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      const fall = q.get('fall');
      if (fall && /^[0-9a-f-]{36}$/i.test(fall)) setFallId(fall);
      if (fall || q.get('tab') === 'mahnwesen') setTab('mahnwesen');
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const load = (m = monat) =>
    fetch(`/api/buchhaltung?monat=${m}`).then(async (r) => {
      if (!r.ok) {
        setFehler(r.status === 403 ? 'Kein Zugriff – nur für die Buchhaltung.' : 'Konnte nicht geladen werden.');
        return;
      }
      setD(await r.json());
    });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/buchhaltung?monat=${monat}`).then(async (r) => {
      if (cancelled) return;
      if (!r.ok) {
        setFehler(r.status === 403 ? 'Kein Zugriff – nur für die Buchhaltung.' : 'Konnte nicht geladen werden.');
        return;
      }
      setD(await r.json());
    });
    return () => {
      cancelled = true;
    };
  }, [monat]);

  const post = async (body: Record<string, unknown>): Promise<boolean> => {
    const res = await fetch('/api/buchhaltung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) toast.error((await res.json().catch(() => ({}))).error ?? 'Fehler');
    else toast.success('Gespeichert');
    await load();
    return res.ok;
  };

  if (fehler) return <Card padding="lg" className="text-center text-gray-700">{fehler}</Card>;
  if (!d) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  const offen = d.rechnungen.filter((z) => !z.geschrieben_am).length;
  const faellig = d.mahn.faelle.filter((f) => f.faellig).length;

  return (
    <div>
      <PageHeader
        label="BUCHHALTUNG"
        title="Rechnungen & Mahnwesen"
        action={
          <SegmentedControl
            items={[
              { value: 'rechnungen', label: `Rechnungen${offen ? ` (${offen})` : ''}` },
              { value: 'vertragsdaten', label: `Vertragsdaten${d.fehlend.length ? ` (${d.fehlend.length})` : ''}` },
              { value: 'mahnwesen', label: `Mahnwesen${faellig ? ` (${faellig})` : ''}` },
            ]}
            value={tab}
            onChange={(v) => setTab(v as typeof tab)}
          />
        }
      />

      {tab === 'rechnungen' && (
        <Card padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
            <button onClick={() => setMonat(monatPlus(monat, -1))} className="p-1 rounded hover:bg-gray-200"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-bold text-gray-800">
              {new Date(`${monat}-01T00:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })} · {d.rechnungen.length} Rechnungen
            </span>
            <button onClick={() => setMonat(monatPlus(monat, 1))} className="p-1 rounded hover:bg-gray-200"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="px-4 divide-y divide-gray-100">
            {d.rechnungen.map((z) => (
              <RechnungRow key={`${z.agency_id}-${z.typ}-${z.periode}`} z={z} onDone={async (nr) => void (await post({ aktion: 'geschrieben', zeile: z, rechnungsnummer: nr }))} />
            ))}
            {!d.rechnungen.length && (
              <p className="py-6 text-sm text-gray-500 text-center">
                Keine Rechnungen – bei {d.fehlend.length} Kunden fehlen Vertragsdaten (Tab „Vertragsdaten“).
              </p>
            )}
          </div>
        </Card>
      )}

      {tab === 'vertragsdaten' && (
        <Card padding="none" className="px-4 divide-y divide-gray-100">
          <p className="py-3 text-sm text-gray-600">
            Damit die Rechnungsliste stimmt, braucht jeder Kunde <strong>Vertragsstart</strong> (= Rechnungstag), <strong>Retainer</strong> und den <strong>Lexoffice-Kontakt</strong>. Vorschläge kommen aus Lexoffice.
          </p>
          {d.fehlend.map((a) => <FehlendRow key={a.id} a={a} onSave={async (p) => void (await post({ aktion: 'vertragsdaten', agency_id: a.id, ...p }))} />)}
          {!d.fehlend.length && <p className="py-6 text-sm text-gray-500 text-center">Alle Vertragsdaten sind vollständig.</p>}
        </Card>
      )}

      {tab === 'mahnwesen' && <MahnwesenTab d={d.mahn} post={post} fallId={fallId} />}
    </div>
  );
}
