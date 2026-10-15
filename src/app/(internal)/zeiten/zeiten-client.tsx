'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Pencil, Play, Plus, Square, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHead, Input, PageHeader, SegmentedControl, Select } from '@/components/ui';
import { ZEITEN_EVENT } from '@/components/zeiten/zeit-pill';
import {
  TAETIGKEITEN,
  dauerFormat,
  dauerParsen,
  eintragMinuten,
  istUeberlang,
  summeAb,
  taetigkeitLabel,
  ueberschneidungen,
  type Zeiteintrag,
} from '@/lib/zeiten/rechnen';

interface Daten {
  schema: boolean;
  hinweis?: string;
  eintraege: Zeiteintrag[];
  laufend: Zeiteintrag | null;
  kunden: Array<{ id: string; name: string; beendet?: boolean }>;
  wochenStart?: string;
  monatsStart?: string;
  heute?: string;
}

const TZ = 'Europe/Berlin';
const uhrFmt = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const tagFmt = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' });
const isoTagFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const uhr24 = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const TAETIGKEIT_OPTIONEN = TAETIGKEITEN.map((t) => ({ value: t.value, label: t.label }));

async function senden(url: string, method: string, body?: unknown): Promise<string | null> {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  if (!r) return 'Keine Verbindung';
  if (r.ok) return null;
  const d = (await r.json().catch(() => ({}))) as { error?: string };
  return d.error ?? 'Fehler beim Speichern';
}

function Feld({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`grid gap-1.5 text-[13px] font-medium text-gray-600 ${className}`}>
      {label}
      {children}
    </label>
  );
}

export function ZeitenClient({ istAdmin }: { istAdmin: boolean }) {
  const [d, setD] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [jetzt, setJetzt] = useState(() => new Date());
  const [ansicht, setAnsicht] = useState<'woche' | 'monat'>('woche');

  // Stoppuhr
  const [kunde, setKunde] = useState('');
  const [taetigkeit, setTaetigkeit] = useState('support');
  const [notiz, setNotiz] = useState('');
  // Nachtragen
  const [nTag, setNTag] = useState('');
  const [nAb, setNAb] = useState('');
  const [nDauer, setNDauer] = useState('');
  const [nKunde, setNKunde] = useState('');
  const [nTaetigkeit, setNTaetigkeit] = useState('support');
  const [nNotiz, setNNotiz] = useState('');
  const [busy, setBusy] = useState(false);
  const [bearbeite, setBearbeite] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const r = await fetch('/api/zeiten', { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) {
      setFehler('Zeiten konnten nicht geladen werden');
      return;
    }
    const daten = (await r.json()) as Daten;
    setD(daten);
    setJetzt(new Date());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Daten beim Öffnen laden
    void laden();
    const neu = () => void laden();
    window.addEventListener(ZEITEN_EVENT, neu);
    return () => window.removeEventListener(ZEITEN_EVENT, neu);
  }, [laden]);

  // Laufende Stoppuhr sichtbar weiterzählen
  useEffect(() => {
    if (!d?.laufend) return;
    const t = setInterval(() => setJetzt(new Date()), 15_000);
    return () => clearInterval(t);
  }, [d?.laufend]);

  const kundenOptionen = useMemo(
    () => [{ value: '', label: 'Intern / kein Kunde' }, ...(d?.kunden ?? []).map((k) => ({ value: k.id, label: k.beendet ? `${k.name} (beendet)` : k.name }))],
    [d?.kunden],
  );
  const kundenName = useMemo(() => new Map((d?.kunden ?? []).map((k) => [k.id, k.name])), [d?.kunden]);
  const doppelt = useMemo(() => ueberschneidungen(d?.eintraege ?? [], jetzt), [d?.eintraege, jetzt]);

  const heute = d?.heute ?? isoTagFmt.format(jetzt);
  const wochenStart = d?.wochenStart ? new Date(d.wochenStart) : null;
  const monatsStart = d?.monatsStart ? new Date(d.monatsStart) : null;
  const eintraege = d?.eintraege ?? [];
  const woche = wochenStart ? summeAb(eintraege, wochenStart, jetzt) : 0;
  const monat = monatsStart ? summeAb(eintraege, monatsStart, jetzt) : 0;
  const sichtbar = eintraege.filter((e) => {
    const ab = ansicht === 'woche' ? wochenStart : monatsStart;
    return !ab || new Date(e.start) >= ab;
  });
  const zuPruefen = eintraege.filter((e) => istUeberlang(e, jetzt) || doppelt.has(e.id)).length;

  // Einträge nach Tag gruppieren (neueste zuerst)
  const tageMap = new Map<string, Zeiteintrag[]>();
  for (const e of sichtbar) {
    const t = isoTagFmt.format(new Date(e.start));
    tageMap.set(t, [...(tageMap.get(t) ?? []), e]);
  }
  const tage = [...tageMap.entries()];

  async function aktion(fn: () => Promise<string | null>, danach?: () => void) {
    setBusy(true);
    setFehler(null);
    const f = await fn();
    setBusy(false);
    if (f) {
      setFehler(f);
      return;
    }
    danach?.();
    window.dispatchEvent(new Event(ZEITEN_EVENT));
  }

  const starten = () =>
    aktion(() => senden('/api/zeiten', 'POST', { aktion: 'start', agency_id: kunde || null, taetigkeit, notiz }), () => setNotiz(''));
  const stoppen = () => aktion(() => senden('/api/zeiten/laufend', 'POST'));
  const nachtragen = () => {
    if (!dauerParsen(nDauer)) {
      setFehler('Dauer bitte als hh:mm angeben, z. B. 1:30');
      return;
    }
    void aktion(
      () => senden('/api/zeiten', 'POST', { aktion: 'nachtragen', tag: nTag || heute, ab: nAb || null, dauer: nDauer, agency_id: nKunde || null, taetigkeit: nTaetigkeit, notiz: nNotiz }),
      () => {
        setNDauer('');
        setNAb('');
        setNNotiz('');
      },
    );
  };
  const loeschen = (id: string) => {
    if (!window.confirm('Eintrag wirklich löschen?')) return;
    void aktion(() => senden(`/api/zeiten/${id}`, 'DELETE'));
  };

  if (!d) {
    return (
      <div className="flex items-center justify-center py-24">
        {fehler ? <p className="text-sm text-red-600">{fehler}</p> : <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-600" />}
      </div>
    );
  }

  const laufend = d.laufend;
  const laufMin = laufend ? eintragMinuten(laufend, jetzt) : 0;

  return (
    <div className="max-w-5xl">
      <PageHeader
        label="ZEITERFASSUNG"
        title="Meine Zeiten"
        description="Stoppuhr starten oder Zeit nachtragen – damit wir sehen, wie viel Arbeit in jedem Kunden steckt."
        action={istAdmin ? <Link href="/admin/zeiten" className="text-sm font-medium text-red-700 hover:text-red-900">Team-Übersicht →</Link> : undefined}
      />

      {!d.schema && (
        <Card padding="sm" className="mb-5 !bg-amber-50 text-[14px] text-amber-800">
          {d.hinweis ?? 'Datenbank-Änderung fehlt noch'} – Zeiten können erst danach gespeichert werden.
        </Card>
      )}
      {fehler && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{fehler}</p>}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card padding="sm">
          <p className="text-xs text-gray-500">Diese Woche</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{dauerFormat(woche)} h</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-gray-500">Dieser Monat</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{dauerFormat(monat)} h</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-gray-500">Zu prüfen</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${zuPruefen ? 'text-amber-600' : ''}`}>{zuPruefen}</p>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* Stoppuhr */}
        <Card>
          <CardHead title="Stoppuhr" />
          {laufend ? (
            <div className="mt-4">
              <p className={`text-4xl font-semibold tabular-nums ${istUeberlang(laufend, jetzt) ? 'text-amber-600' : 'text-ink'}`}>{dauerFormat(laufMin)}</p>
              <p className="mt-1 text-[14px] text-gray-600">
                {laufend.agency_id ? kundenName.get(laufend.agency_id) ?? 'Kunde' : 'Intern'} · {taetigkeitLabel(laufend.taetigkeit)} · seit {uhrFmt.format(new Date(laufend.start))} Uhr
              </p>
              {istUeberlang(laufend, jetzt) && (
                <p className="mt-2 flex items-center gap-1.5 text-[13px] text-amber-700">
                  <AlertTriangle className="h-4 w-4" /> Läuft über 10 Stunden – vergessen? Nach dem Stoppen unten die Dauer korrigieren.
                </p>
              )}
              <Button className="mt-4" onClick={stoppen} disabled={busy}>
                <Square className="fill-current" /> Stopp
              </Button>
              <p className="mt-3 text-[12.5px] text-gray-500">Neue Stoppuhr starten stoppt die laufende automatisch:</p>
            </div>
          ) : (
            <p className="mt-2 text-[14px] text-gray-600">Kunde und Tätigkeit wählen, starten – oben im Kopf läuft die Zeit mit.</p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Feld label="Kunde">
              <Select options={kundenOptionen} value={kunde} onChange={(e) => setKunde(e.target.value)} />
            </Feld>
            <Feld label="Tätigkeit">
              <Select options={TAETIGKEIT_OPTIONEN} value={taetigkeit} onChange={(e) => setTaetigkeit(e.target.value)} />
            </Feld>
            <Feld label="Notiz (optional)" className="sm:col-span-2">
              <Input value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Kampagne angepasst" maxLength={1000} />
            </Feld>
          </div>
          <Button className="mt-4" variant={laufend ? 'secondary' : 'primary'} onClick={starten} disabled={busy || !d.schema}>
            <Play /> {laufend ? 'Wechseln & starten' : 'Start'}
          </Button>
        </Card>

        {/* Nachtragen */}
        <Card>
          <CardHead title="Nachtragen" />
          <p className="mt-2 text-[14px] text-gray-600">Vergessen zu stoppen oder unterwegs gearbeitet? Einfach die Dauer eintragen.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Feld label="Datum">
              <Input type="date" value={nTag || heute} max={heute} onChange={(e) => setNTag(e.target.value)} />
            </Feld>
            <Feld label="Dauer (hh:mm)">
              <Input value={nDauer} onChange={(e) => setNDauer(e.target.value)} placeholder="1:30" inputMode="numeric" />
            </Feld>
            <Feld label="Beginn (optional)">
              <Input type="time" value={nAb} onChange={(e) => setNAb(e.target.value)} />
            </Feld>
            <Feld label="Kunde" className="sm:col-span-2">
              <Select options={kundenOptionen} value={nKunde} onChange={(e) => setNKunde(e.target.value)} />
            </Feld>
            <Feld label="Tätigkeit">
              <Select options={TAETIGKEIT_OPTIONEN} value={nTaetigkeit} onChange={(e) => setNTaetigkeit(e.target.value)} />
            </Feld>
            <Feld label="Notiz (optional)" className="sm:col-span-3">
              <Input value={nNotiz} onChange={(e) => setNNotiz(e.target.value)} maxLength={1000} />
            </Feld>
          </div>
          <Button className="mt-4" onClick={nachtragen} disabled={busy || !d.schema || !nDauer}>
            <Plus /> Eintragen
          </Button>
        </Card>
      </div>

      {/* Liste */}
      <Card>
        <CardHead
          title="Einträge"
          action={
            <SegmentedControl
              items={[
                { value: 'woche', label: 'Woche' },
                { value: 'monat', label: 'Monat' },
              ]}
              value={ansicht}
              onChange={(v) => setAnsicht(v as 'woche' | 'monat')}
            />
          }
        />
        {tage.length === 0 ? (
          <p className="mt-4 text-[14px] text-gray-500">Noch keine Zeiten in diesem Zeitraum.</p>
        ) : (
          <div className="mt-4 grid gap-5">
            {tage.map(([tag, liste]) => (
              <div key={tag}>
                <div className="mb-2 flex items-center justify-between border-b border-[var(--hair)] pb-1.5 text-[13px] font-semibold text-gray-600">
                  <span>{tagFmt.format(new Date(liste[0].start))}</span>
                  <span className="tabular-nums">{dauerFormat(liste.reduce((s, e) => s + eintragMinuten(e, jetzt), 0))} h</span>
                </div>
                <div className="grid gap-1.5">
                  {liste.map((e) =>
                    bearbeite === e.id ? (
                      <Bearbeiten
                        key={e.id}
                        eintrag={e}
                        kundenOptionen={kundenOptionen}
                        heute={heute}
                        busy={busy}
                        onAbbrechen={() => setBearbeite(null)}
                        onSpeichern={(body) => aktion(() => senden(`/api/zeiten/${e.id}`, 'PATCH', body), () => setBearbeite(null))}
                      />
                    ) : (
                      <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-[14px] hover:bg-gray-50">
                        <span className="w-[110px] flex-none tabular-nums text-gray-500">
                          {uhrFmt.format(new Date(e.start))}–{e.ende ? uhrFmt.format(new Date(e.ende)) : '…'}
                        </span>
                        <span className="w-14 flex-none font-semibold tabular-nums">{dauerFormat(eintragMinuten(e, jetzt))}</span>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{e.agency_id ? kundenName.get(e.agency_id) ?? 'Kunde' : 'Intern'}</span>
                          <span className="text-gray-500"> · {taetigkeitLabel(e.taetigkeit)}</span>
                          {e.notiz && <span className="text-gray-500"> · {e.notiz}</span>}
                        </span>
                        {!e.ende && <Badge tone="softAccent">läuft</Badge>}
                        {istUeberlang(e, jetzt) && <Badge tone="warning">über 10 h – prüfen</Badge>}
                        {doppelt.has(e.id) && <Badge tone="warning">überschneidet sich</Badge>}
                        <button type="button" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-ink" onClick={() => setBearbeite(e.id)} aria-label="Bearbeiten">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700" onClick={() => loeschen(e.id)} aria-label="Löschen">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Bearbeiten({
  eintrag,
  kundenOptionen,
  heute,
  busy,
  onAbbrechen,
  onSpeichern,
}: {
  eintrag: Zeiteintrag;
  kundenOptionen: Array<{ value: string; label: string }>;
  heute: string;
  busy: boolean;
  onAbbrechen: () => void;
  onSpeichern: (body: Record<string, unknown>) => void;
}) {
  const start = new Date(eintrag.start);
  const [tag, setTag] = useState(isoTagFmt.format(start));
  const [ab, setAb] = useState(uhr24.format(start));
  const [dauer, setDauer] = useState(eintrag.ende ? dauerFormat(eintragMinuten(eintrag)) : '');
  const [kunde, setKunde] = useState(eintrag.agency_id ?? '');
  const [taetigkeit, setTaetigkeit] = useState(eintrag.taetigkeit);
  const [notiz, setNotiz] = useState(eintrag.notiz ?? '');

  return (
    <div className="grid gap-3 rounded-xl bg-panel p-3 shadow-[inset_0_0_0_1px_var(--hair)] sm:grid-cols-6">
      <Feld label="Datum" className="sm:col-span-2">
        <Input type="date" value={tag} max={heute} onChange={(e) => setTag(e.target.value)} />
      </Feld>
      <Feld label="Beginn">
        <Input type="time" value={ab} onChange={(e) => setAb(e.target.value)} />
      </Feld>
      <Feld label={eintrag.ende ? 'Dauer (hh:mm)' : 'Dauer (stoppt)'}>
        <Input value={dauer} onChange={(e) => setDauer(e.target.value)} placeholder={eintrag.ende ? '' : 'läuft'} />
      </Feld>
      <Feld label="Tätigkeit" className="sm:col-span-2">
        <Select options={TAETIGKEIT_OPTIONEN} value={taetigkeit} onChange={(e) => setTaetigkeit(e.target.value)} />
      </Feld>
      <Feld label="Kunde" className="sm:col-span-3">
        <Select options={kundenOptionen} value={kunde} onChange={(e) => setKunde(e.target.value)} />
      </Feld>
      <Feld label="Notiz" className="sm:col-span-3">
        <Input value={notiz} onChange={(e) => setNotiz(e.target.value)} maxLength={1000} />
      </Feld>
      <div className="flex gap-2 sm:col-span-6">
        <Button size="sm" disabled={busy} onClick={() => onSpeichern({ tag, ab, dauer: dauer || null, agency_id: kunde || null, taetigkeit, notiz })}>
          Speichern
        </Button>
        <Button size="sm" variant="ghost" onClick={onAbbrechen}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
