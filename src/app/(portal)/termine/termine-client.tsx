'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, ExternalLink, MapPin, Search, StickyNote, User } from 'lucide-react';
import { Badge, Button, Card, IconButton, Input, Modal, PageHeader, Select } from '@/components/ui';
import { STATUS_LABEL, addTage, isoTag, rasterPosition, wochenStart, type Termin, type TerminStatus } from '@/lib/termine/normalize';

const VON = 7;
const BIS = 20;
const STUNDEN = Array.from({ length: BIS - VON }, (_, i) => VON + i);
const TAG_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Farbe je Termin-Typ */
function farbe(t: Termin): { box: string; dot: string } {
  if (t.typ === 'probetag') return { box: 'bg-amber-50 text-amber-900 shadow-[inset_3px_0_0_#d97706]', dot: 'bg-amber-500' };
  if (t.typ === 'vorstellungsgespraech' || t.typ === 'interview') return { box: 'bg-red-50 text-red-900 shadow-[inset_3px_0_0_var(--r-700)]', dot: 'bg-red-700' };
  if (t.typ === 'erstgespraech' || t.typ === 'termin') return { box: 'bg-sky-50 text-sky-900 shadow-[inset_3px_0_0_#0284c7]', dot: 'bg-sky-600' };
  return { box: 'bg-gray-100 text-gray-800 shadow-[inset_3px_0_0_#78716c]', dot: 'bg-gray-500' };
}

const STATUS_TONE: Record<TerminStatus, 'neutral' | 'success' | 'danger' | 'warning'> = {
  geplant: 'neutral',
  erschienen: 'success',
  no_show: 'danger',
  abgesagt: 'warning',
};

const uhr = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Überlappende Termine eines Tages nebeneinander legen */
function spuren(termine: Termin[]): Map<string, { spur: number; spuren: number }> {
  const sortiert = [...termine].sort((a, b) => a.start.localeCompare(b.start));
  const out = new Map<string, { spur: number; spuren: number }>();
  let gruppe: Termin[] = [];
  let gruppeEnde = '';
  const schliessen = () => {
    const enden: string[] = [];
    const zuordnung: Array<[string, number]> = [];
    for (const t of gruppe) {
      let s = enden.findIndex((e) => e <= t.start);
      if (s === -1) s = enden.length;
      enden[s] = t.ende;
      zuordnung.push([t.id, s]);
    }
    for (const [id, s] of zuordnung) out.set(id, { spur: s, spuren: enden.length });
    gruppe = [];
  };
  for (const t of sortiert) {
    if (gruppe.length && t.start >= gruppeEnde) schliessen();
    gruppe.push(t);
    gruppeEnde = gruppe.length === 1 || t.ende > gruppeEnde ? t.ende : gruppeEnde;
  }
  if (gruppe.length) schliessen();
  return out;
}

export function TermineClient() {
  const [woche, setWoche] = useState<Date>(() => wochenStart(new Date()));
  const [termine, setTermine] = useState<Termin[] | null>(null);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [aktiv, setAktiv] = useState<Termin | null>(null);
  const [neu, setNeu] = useState(false);
  const [heute, setHeute] = useState('');
  const [jetztMin, setJetztMin] = useState<number | null>(null);

  const tage = useMemo(() => Array.from({ length: 7 }, (_, i) => addTage(woche, i)), [woche]);
  const von = isoTag(tage[0]);
  const bis = isoTag(tage[6]);

  const laden = useCallback(async () => {
    try {
      const res = await fetch(`/api/termine?von=${von}&bis=${bis}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Fehler');
      setTermine(data.termine);
      setFeedUrl(data.feedUrl);
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Termine konnten nicht geladen werden');
    }
  }, [von, bis]);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  // „Jetzt“-Linie und Heute-Markierung, jede Minute aktualisiert
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setHeute(isoTag(d));
      setJetztMin(d.getHours() * 60 + d.getMinutes());
    };
    const t0 = setTimeout(tick, 0);
    const t = setInterval(tick, 60_000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);

  const proTag = useMemo(() => {
    const m = new Map<string, Termin[]>();
    for (const t of termine ?? []) {
      const k = isoTag(new Date(t.start));
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return m;
  }, [termine]);

  const geplant = (termine ?? []).filter((t) => t.status === 'geplant' && isoTag(new Date(t.start)) >= von && isoTag(new Date(t.start)) <= bis).length;
  const wochenLabel = `${tage[0].toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${tage[6].toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const setzeStatus = async (t: Termin, status: TerminStatus) => {
    const res = await fetch(`/api/appointments/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? 'Status konnte nicht geändert werden');
      return;
    }
    toast.success(
      status === 'no_show' && data.noshow_points ? `No-Show eingetragen (${data.noshow_points} Punkte)` : `Termin: ${STATUS_LABEL[status]}`,
    );
    setAktiv(null);
    await laden();
  };

  return (
    <div>
      <PageHeader
        title="Kalender"
        description="Alle Termine mit Bewerbern – Vorstellungsgespräche, Probetage und gebuchte Termine."
        action={
          <Button onClick={() => setNeu(true)}>
            <CalendarPlus /> Termin anlegen
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <IconButton onClick={() => setWoche((w) => addTage(w, -7))} aria-label="Vorherige Woche">
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <IconButton onClick={() => setWoche((w) => addTage(w, 7))} aria-label="Nächste Woche">
          <ChevronRight className="h-5 w-5" />
        </IconButton>
        <Button variant="secondary" size="sm" onClick={() => setWoche(wochenStart(new Date()))}>
          Heute
        </Button>
        <h2 className="ml-1 text-[17px] font-medium tracking-[-0.02em]">{wochenLabel}</h2>
        <span className="ml-auto text-[13.5px] text-gray-600">
          <strong className="font-semibold text-ink">{geplant}</strong> geplant diese Woche
        </span>
      </div>

      {fehler && (
        <Card className="mb-4 text-[14px] text-red-800">{fehler}</Card>
      )}

      {/* Desktop: Wochenraster */}
      <Card padding="none" className="hidden overflow-hidden md:block">
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-hair">
          <div />
          {tage.map((d, i) => {
            const k = isoTag(d);
            const istHeute = k === heute;
            const ausserhalb = (proTag.get(k) ?? []).filter((t) => !rasterPosition(t.start, t.ende, VON, BIS));
            return (
              <div key={k} className={`border-l border-hair px-2 py-2.5 text-center ${istHeute ? 'bg-red-50/60' : ''}`}>
                <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-gray-500">{TAG_KURZ[i]}</p>
                <p
                  className={`mx-auto mt-0.5 grid h-8 w-8 place-items-center rounded-full text-[16px] font-semibold ${
                    istHeute ? 'bg-gradient-to-b from-red-700 to-red-950 text-red-50' : 'text-ink'
                  }`}
                >
                  {d.getDate()}
                </p>
                {ausserhalb.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setAktiv(t)}
                    className={`mt-1 block w-full truncate rounded-[8px] px-1.5 py-0.5 text-left text-[11.5px] ${farbe(t).box}`}
                  >
                    {uhr(t.start)} {t.candidate_name}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <div className="relative grid max-h-[68vh] grid-cols-[56px_repeat(7,minmax(0,1fr))] overflow-y-auto pb-2 pt-3">
          <div>
            {STUNDEN.map((h) => (
              <div key={h} className="h-14 pr-2 text-right text-[11.5px] text-gray-500">
                <span className="relative -top-2">{h}:00</span>
              </div>
            ))}
          </div>
          {tage.map((d) => {
            const k = isoTag(d);
            const liste = (proTag.get(k) ?? []).filter((t) => rasterPosition(t.start, t.ende, VON, BIS));
            const lanes = spuren(liste);
            return (
              <div key={k} className={`relative border-l border-hair ${k === heute ? 'bg-red-50/30' : ''}`}>
                {STUNDEN.map((h) => (
                  <div key={h} className="h-14 border-t border-hair/70" />
                ))}
                {k === heute && jetztMin !== null && jetztMin >= VON * 60 && jetztMin <= BIS * 60 && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-red-700" style={{ top: `${((jetztMin - VON * 60) / ((BIS - VON) * 60)) * 100}%` }}>
                    <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-700" />
                  </div>
                )}
                {liste.map((t) => {
                  const pos = rasterPosition(t.start, t.ende, VON, BIS)!;
                  const lane = lanes.get(t.id) ?? { spur: 0, spuren: 1 };
                  const f = farbe(t);
                  return (
                    <button
                      key={t.id}
                      onClick={() => setAktiv(t)}
                      className={`absolute overflow-hidden rounded-[10px] px-2 py-1 text-left text-[12px] leading-tight transition-transform hover:z-20 hover:-translate-y-px ${f.box} ${
                        t.status === 'abgesagt' ? 'opacity-50 line-through' : ''
                      } ${t.status === 'no_show' ? 'outline outline-1 outline-dashed outline-red-700' : ''}`}
                      style={{
                        top: `${pos.top}%`,
                        height: `${pos.height}%`,
                        left: `calc(${(lane.spur / lane.spuren) * 100}% + 3px)`,
                        width: `calc(${100 / lane.spuren}% - 6px)`,
                      }}
                      title={`${t.typLabel} · ${t.candidate_name}`}
                    >
                      <span className="block truncate font-semibold">{t.candidate_name}</span>
                      <span className="block truncate opacity-80">
                        {uhr(t.start)} · {t.typLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Mobil: Tagesliste */}
      <div className="space-y-3 md:hidden">
        {tage.map((d, i) => {
          const k = isoTag(d);
          const liste = proTag.get(k) ?? [];
          const istHeute = k === heute;
          return (
            <Card key={k} padding="sm" className={istHeute ? 'shadow-[inset_0_0_0_1.5px_var(--r-700)]' : ''}>
              <p className={`text-[14px] font-semibold ${istHeute ? 'text-red-800' : 'text-ink'}`}>
                {TAG_KURZ[i]}, {d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}
                {istHeute && ' · Heute'}
              </p>
              {liste.length === 0 ? (
                <p className="mt-1 text-[13px] text-gray-500">Keine Termine</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {liste.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => setAktiv(t)}
                        className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left ${farbe(t).box} ${t.status === 'abgesagt' ? 'opacity-50' : ''}`}
                      >
                        <span className="w-12 flex-none text-[13px] font-semibold">{uhr(t.start)}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[14px] font-medium ${t.status === 'abgesagt' ? 'line-through' : ''}`}>{t.candidate_name}</span>
                          <span className="block truncate text-[12px] opacity-80">{t.typLabel}</span>
                        </span>
                        {t.status !== 'geplant' && <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[12.5px] text-gray-600">
        {[
          ['bg-red-700', 'Vorstellungsgespräch'],
          ['bg-amber-500', 'Probetag'],
          ['bg-sky-600', 'Erstgespräch'],
        ].map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${c}`} /> {l}
          </span>
        ))}
        {feedUrl && (
          <Link href="/settings" className="ml-auto inline-flex items-center gap-1.5 font-medium text-red-800 hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> Kalender in Outlook/Google abonnieren
          </Link>
        )}
      </div>

      <Modal open={!!aktiv} onClose={() => setAktiv(null)} title={aktiv?.typLabel}>
        {aktiv && <TerminDetails t={aktiv} onStatus={(s) => setzeStatus(aktiv, s)} />}
      </Modal>

      <Modal open={neu} onClose={() => setNeu(false)} title="Termin anlegen">
        {neu && (
          <NeuerTermin
            onFertig={async () => {
              setNeu(false);
              await laden();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function TerminDetails({ t, onStatus }: { t: Termin; onStatus: (s: TerminStatus) => void }) {
  const [busy, setBusy] = useState(false);
  const datum = new Date(t.start).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const aktion = async (s: TerminStatus) => {
    setBusy(true);
    try {
      await onStatus(s);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${farbe(t).dot}`} />
        <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
        {!t.bearbeitbar && <span className="text-[12px] text-gray-500">über Buchungslink</span>}
      </div>
      <ul className="space-y-2.5 text-[14.5px]">
        <li className="flex items-start gap-2.5">
          <User className="mt-0.5 h-4 w-4 flex-none text-gray-500" />
          {t.candidate_id ? (
            <Link href={`/candidates/${t.candidate_id}`} className="font-medium text-red-800 hover:underline">
              {t.candidate_name}
            </Link>
          ) : (
            <span>{t.candidate_name}</span>
          )}
        </li>
        <li className="flex items-start gap-2.5">
          <Clock className="mt-0.5 h-4 w-4 flex-none text-gray-500" />
          <span>
            {datum}, {uhr(t.start)} – {uhr(t.ende)} Uhr
          </span>
        </li>
        {t.ort && (
          <li className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 flex-none text-gray-500" />
            <span className="break-all">{t.ort}</span>
          </li>
        )}
        {t.notizen && (
          <li className="flex items-start gap-2.5">
            <StickyNote className="mt-0.5 h-4 w-4 flex-none text-gray-500" />
            <span className="whitespace-pre-wrap">{t.notizen}</span>
          </li>
        )}
      </ul>
      {t.bearbeitbar && (
        <div className="grid grid-cols-2 gap-2 border-t border-hair pt-4 sm:grid-cols-3">
          {t.status !== 'erschienen' && (
            <Button size="sm" disabled={busy} onClick={() => aktion('erschienen')}>
              Erschienen
            </Button>
          )}
          {t.status !== 'no_show' && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => aktion('no_show')}>
              No-Show
            </Button>
          )}
          {t.status !== 'abgesagt' && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => confirm('Termin wirklich absagen? Der Bewerber bekommt eine Absage per E-Mail.') && aktion('abgesagt')}
            >
              Absagen
            </Button>
          )}
          {t.status !== 'geplant' && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => aktion('geplant')}>
              Wieder geplant
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

type Treffer = { id: string; name: string; phone: string | null; email: string | null };

function NeuerTermin({ onFertig }: { onFertig: () => Promise<void> }) {
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [bewerber, setBewerber] = useState<Treffer | null>(null);
  const [typ, setTyp] = useState('vorstellungsgespraech');
  const [datum, setDatum] = useState('');
  const [zeit, setZeit] = useState('10:00');
  const [notizen, setNotizen] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (bewerber) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/termine/bewerber?q=${encodeURIComponent(suche)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setTreffer(Array.isArray(d) ? d : []))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [suche, bewerber]);

  const speichern = async () => {
    if (!bewerber || !datum || !zeit) {
      toast.error('Bitte Bewerber, Datum und Uhrzeit angeben');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/candidates/${bewerber.id}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: typ, scheduled_at: new Date(`${datum}T${zeit}`).toISOString(), notes: notizen || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Termin konnte nicht angelegt werden');
      toast.success(data.confirmation_sent ? 'Termin angelegt – Bestätigung an den Bewerber verschickt' : 'Termin angelegt');
      await onFertig();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-gray-600">Bewerber</p>
        {bewerber ? (
          <div className="flex items-center justify-between gap-3 rounded-[12px] bg-panel px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium">{bewerber.name}</p>
              <p className="truncate text-[12.5px] text-gray-600">{bewerber.phone ?? bewerber.email ?? ''}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setBewerber(null)}>
              Ändern
            </Button>
          </div>
        ) : (
          <>
            <Input icon={<Search />} placeholder="Name, Telefon oder E-Mail …" value={suche} onChange={(e) => setSuche(e.target.value)} autoFocus />
            <ul className="mt-2 max-h-52 overflow-y-auto rounded-[12px] shadow-[inset_0_0_0_1.5px_var(--hair)]">
              {treffer.length === 0 && <li className="px-3.5 py-3 text-[13.5px] text-gray-500">Keine Bewerber gefunden</li>}
              {treffer.map((b) => (
                <li key={b.id}>
                  <button onClick={() => setBewerber(b)} className="w-full px-3.5 py-2.5 text-left hover:bg-panel">
                    <span className="block truncate text-[14.5px] font-medium">{b.name}</span>
                    <span className="block truncate text-[12.5px] text-gray-600">{b.phone ?? b.email ?? ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-gray-600">Art</p>
        <Select
          value={typ}
          onChange={(e) => setTyp(e.target.value)}
          options={[
            { value: 'vorstellungsgespraech', label: 'Vorstellungsgespräch' },
            { value: 'probetag', label: 'Probetag' },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-gray-600">Datum</span>
          <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-gray-600">Uhrzeit</span>
          <Input type="time" value={zeit} onChange={(e) => setZeit(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-gray-600">Notiz / Ort (optional)</span>
        <textarea
          value={notizen}
          onChange={(e) => setNotizen(e.target.value)}
          rows={3}
          placeholder="z. B. Adresse, Ansprechpartner, mitbringen …"
          className="w-full rounded-[12px] bg-card px-3.5 py-2.5 text-[15px] shadow-[inset_0_0_0_1.5px_var(--hair)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--r-700)]"
        />
      </label>
      <Button className="w-full" onClick={speichern} disabled={busy}>
        {busy ? 'Wird angelegt …' : 'Termin anlegen'}
      </Button>
      <p className="text-[12px] text-gray-500">Der Bewerber bekommt eine Bestätigung mit Kalendereintrag per E-Mail (falls hinterlegt).</p>
    </div>
  );
}
