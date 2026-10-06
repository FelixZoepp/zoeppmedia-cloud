'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, PageHeader, StatCard } from '@/components/ui';
import type { RoiUebersicht } from '@/lib/roi/laden';

type Daten = RoiUebersicht & { schreiben: boolean };
type Zelle = { umsatz: string; provision: string; aktiv: boolean };

const TZ = 'Europe/Berlin';
const monatKurz = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString('de-DE', { month: 'short', year: '2-digit', timeZone: TZ });
const monatLang = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: TZ });
const eur = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`);
const faktor = (n: number | null) => (n === null ? '–' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })}×`);
const alsText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

export function UmsaetzeClient() {
  const [d, setD] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [formular, setFormular] = useState<Record<string, Zelle>>({});
  const [speichert, setSpeichert] = useState(false);

  const laden = useCallback(async () => {
    try {
      const r = await fetch('/api/umsaetze', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Fehler');
      setD(j);
      // Formular für den letzten Monat mit vorhandenen Werten vorbelegen
      const m = (j as Daten).roi.letzterMonat;
      setFormular(
        Object.fromEntries(
          (j as Daten).vertriebler.map((v) => {
            const e = v.eintraege[m];
            return [v.id, { umsatz: alsText(e?.umsatz), provision: alsText(e?.provision), aktiv: e ? e.aktiv : true }];
          }),
        ),
      );
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Fehler');
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function senden(eintraege: Array<Record<string, unknown>>) {
    const r = await fetch('/api/umsaetze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eintraege }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? 'Speichern fehlgeschlagen');
  }

  async function monatSpeichern() {
    if (!d) return;
    const m = d.roi.letzterMonat;
    const eintraege = d.vertriebler
      .filter((v) => v.eingestellt_am.slice(0, 7) <= m.slice(0, 7))
      .filter((v) => formular[v.id] && (formular[v.id].umsatz.trim() !== '' || !formular[v.id].aktiv))
      .map((v) => ({ candidate_id: v.id, monat: m, umsatz: formular[v.id].umsatz.trim() || '0', provision: formular[v.id].provision.trim() || null, aktiv: formular[v.id].aktiv }));
    if (!eintraege.length) return toast.error('Bitte mindestens einen Umsatz eintragen');
    setSpeichert(true);
    try {
      await senden(eintraege);
      toast.success(`${monatLang(m)} gespeichert`);
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setSpeichert(false);
    }
  }

  async function zelleSpeichern(candidateId: string, monat: string, umsatz: string, aktiv: boolean) {
    if (umsatz.trim() === '') return;
    try {
      await senden([{ candidate_id: candidateId, monat, umsatz, aktiv }]);
      toast.success('Gespeichert');
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler');
    }
  }

  if (fehler) return <Card className="text-red-800">{fehler}</Card>;
  if (!d) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
      </div>
    );
  }

  const r = d.roi;
  /** Seit wann jemand als „nicht mehr dabei“ eingetragen ist (erster Monat mit aktiv = false) */
  const rausAb = (v: Daten['vertriebler'][number]) =>
    Object.entries(v.eintraege)
      .filter(([, e]) => !e.aktiv)
      .map(([m]) => m)
      .sort()[0] ?? null;
  // Im Formular: wer im letzten Monat schon da war und nicht vorher ausgeschieden ist (oder schon einen Eintrag hat)
  const imLetzten = d.vertriebler.filter((v) => {
    if (v.eingestellt_am.slice(0, 7) > r.letzterMonat.slice(0, 7)) return false;
    const raus = rausAb(v);
    return !raus || raus >= r.letzterMonat || !!v.eintraege[r.letzterMonat];
  });
  const verlauf = r.monate.slice(0, -1); // abgeschlossene Monate
  const max = Math.max(1, ...verlauf.map((m) => Math.max(m.umsatz, m.kosten ?? 0)));

  return (
    <div className="space-y-6">
      <PageHeader
        label="ERGEBNISSE"
        title="Umsätze & ROI"
        description="Was deine neuen Vertriebler umsetzen – und was die Kampagne dir damit bringt. Bitte trag die Umsätze jeden Monat ein."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard hero title={`Umsatz der Neuen (${monatKurz(r.letzterMonat)})`} value={r.umsatzLetzterMonat ?? '–'} suffix={r.umsatzLetzterMonat !== null ? ' €' : ''} trend={r.wachstumProzent ?? undefined} trendLabel="ggü. Vormonat" note={r.umsatzLetzterMonat === null ? 'noch nicht eingetragen' : undefined} />
        <StatCard title="ROI letzter Monat" value={faktor(r.roiLetzterMonat)} note={r.kostenProMonat ? `bei ${eur(r.kostenProMonat)} Kosten/Monat` : 'Kosten nicht hinterlegt'} />
        <StatCard title="ROI seit Start" value={faktor(r.roiKumuliert)} note={`${eur(r.umsatzGesamt)} Umsatz · ${eur(r.kostenGesamt)} Kosten`} />
        <StatCard title="Aktive Vertriebler" value={r.aktiveVertriebler} note={`${d.einstellungenGesamt} eingestellt · ${d.einstellungen30} in 30 Tagen`} />
      </div>

      {d.schreiben && imLetzten.length > 0 && (
        <Card className={r.fehlend.length ? 'shadow-[inset_0_0_0_1.5px_#f3c26b]' : ''}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
                {r.fehlend.length > 0 && <AlertTriangle className="h-5 w-5 text-amber-600" />}
                {monatLang(r.letzterMonat)} eintragen
              </h2>
              <p className="mt-1 text-[13.5px] text-gray-600">
                {r.fehlend.length ? `Noch offen: ${r.fehlend.length} von ${imLetzten.length} Vertrieblern.` : 'Alles eingetragen – danke! Du kannst die Werte hier noch anpassen.'}
              </p>
            </div>
            <Button onClick={monatSpeichern} disabled={speichert}>
              {speichert ? <Loader2 className="animate-spin" /> : <Check />} Speichern
            </Button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead>
                <tr className="border-b border-hair text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                  <th className="pb-2">Vertriebler</th>
                  <th className="pb-2">Umsatz (€)</th>
                  <th className="pb-2">Provision (€, optional)</th>
                  <th className="pb-2 text-center">Noch dabei</th>
                </tr>
              </thead>
              <tbody>
                {imLetzten.map((v) => {
                  const f = formular[v.id] ?? { umsatz: '', provision: '', aktiv: true };
                  const setze = (p: Partial<Zelle>) => setFormular((x) => ({ ...x, [v.id]: { ...f, ...p } }));
                  const fehlt = r.fehlend.some((x) => x.id === v.id);
                  return (
                    <tr key={v.id} className="border-b border-hair last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{v.name}</span>
                        {fehlt && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11.5px] font-semibold text-amber-800">fehlt</span>}
                      </td>
                      <td className="py-2 pr-3">
                        <input inputMode="decimal" value={f.umsatz} onChange={(e) => setze({ umsatz: e.target.value })} placeholder="0" className="h-10 w-full max-w-[160px] rounded-[12px] bg-card px-3 shadow-[inset_0_0_0_1.5px_var(--hair)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--r-700)]" />
                      </td>
                      <td className="py-2 pr-3">
                        <input inputMode="decimal" value={f.provision} onChange={(e) => setze({ provision: e.target.value })} placeholder="–" className="h-10 w-full max-w-[160px] rounded-[12px] bg-card px-3 shadow-[inset_0_0_0_1.5px_var(--hair)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--r-700)]" />
                      </td>
                      <td className="py-2 text-center">
                        <input type="checkbox" checked={f.aktiv} onChange={(e) => setze({ aktiv: e.target.checked })} className="h-5 w-5 accent-red-700" aria-label={`${v.name} noch dabei`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="text-[19px] font-medium tracking-[-0.02em]">Umsatz der Neuen je Monat</h2>
        <p className="mt-1 text-[13.5px] text-gray-600">Rot = Umsatz deiner neuen Vertriebler · Gelb = Kosten (Betreuung + Werbebudget) · darunter der ROI</p>
        <div className="mt-5 overflow-x-auto">
          <div className="grid grid-cols-6 items-end gap-2 sm:min-w-[520px] sm:grid-cols-11">
            {verlauf.map((m, i) => (
              <div key={m.monat} className={`flex-col items-center justify-end gap-1 ${i < verlauf.length - 6 ? 'hidden sm:flex' : 'flex'}`} title={`${eur(m.umsatz)} Umsatz · ${m.kosten ? eur(m.kosten) : '–'} Kosten`}>
                <span className="text-[11px] font-semibold">{m.umsatz ? `${Math.round(m.umsatz / 1000)}k` : ''}</span>
                <div className="flex h-[150px] w-full items-end justify-center gap-1">
                  <div className="w-full max-w-[28px] origin-bottom rounded-[7px] bg-gradient-to-b from-red-700 to-red-950" style={{ height: `${Math.max(2, (m.umsatz / max) * 100)}%`, animation: `fx-grow .8s cubic-bezier(.33,1,.68,1) ${i * 40}ms both` }} />
                  {m.kosten !== null && <div className="w-2 origin-bottom rounded-[4px] bg-amber-300" style={{ height: `${(m.kosten / max) * 100}%`, animation: `fx-grow .8s cubic-bezier(.33,1,.68,1) ${i * 40}ms both` }} />}
                </div>
                <span className="text-[11px] text-gray-500">{monatKurz(m.monat)}</span>
                {m.roi !== null && <span className="text-[10.5px] font-medium text-gray-600">{faktor(m.roi)}</span>}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-[19px] font-medium tracking-[-0.02em]">Vertriebler × Monate</h2>
        <p className="mt-1 text-[13.5px] text-gray-600">{d.schreiben ? 'Zum Ändern in ein Feld klicken, Wert eintragen und Feld verlassen.' : 'Nur lesender Zugriff.'}</p>
        {d.vertriebler.length === 0 ? (
          <p className="mt-4 text-[14px] text-gray-500">Noch keine eingestellten Vertriebler. Sobald du einen Bewerber auf „Eingestellt“ setzt, erscheint er hier.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-[14px]">
              <thead>
                <tr className="border-b border-hair text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                  <th className="pb-2">Vertriebler</th>
                  <th className="pb-2">Eingestellt</th>
                  {d.monate.map((m) => (
                    <th key={m} className="pb-2 text-right">
                      {monatKurz(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.vertriebler.map((v) => (
                  <tr key={v.id} className="border-b border-hair last:border-0">
                    <td className="py-2 pr-3 font-medium">{v.name}</td>
                    <td className="py-2 pr-3 text-gray-600">{new Date(v.eingestellt_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: TZ })}</td>
                    {d.monate.map((m) => {
                      const e = v.eintraege[m];
                      const raus = rausAb(v);
                      const vorher = v.eingestellt_am.slice(0, 7) > m.slice(0, 7) || (!!raus && m > raus && !e);
                      return (
                        <td key={m} className="py-1.5 text-right">
                          {vorher ? (
                            <span className="text-gray-300">–</span>
                          ) : d.schreiben ? (
                            <input
                              key={`${v.id}-${m}-${e?.umsatz ?? ''}`}
                              defaultValue={alsText(e?.umsatz)}
                              inputMode="decimal"
                              placeholder="–"
                              onBlur={(x) => x.target.value !== alsText(e?.umsatz) && zelleSpeichern(v.id, m, x.target.value, e?.aktiv ?? true)}
                              className={`h-9 w-24 rounded-[10px] px-2 text-right outline-none focus:bg-card focus:shadow-[inset_0_0_0_1.5px_var(--r-700)] ${e ? (e.aktiv ? 'bg-panel' : 'bg-gray-100 text-gray-400') : 'bg-amber-50/60'}`}
                            />
                          ) : (
                            <span className={e && !e.aktiv ? 'text-gray-400' : ''}>{e ? eur(e.umsatz) : '–'}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
