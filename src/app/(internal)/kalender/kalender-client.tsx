'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { PageHeader, Button, Card, Avatar, SegmentedControl } from '@/components/ui';
import type { CalendarEntry, CalendarKind } from '@/lib/team/calendar';

const KIND: Record<CalendarKind, { label: string; chip: string; bar: string }> = {
  termin: { label: 'Termin', chip: 'bg-red-50 text-red-800', bar: '#a3201a' },
  schritt: { label: 'Fulfillment', chip: 'bg-amber-50 text-amber-800', bar: '#e8a317' },
  ad: { label: 'Ad', chip: 'bg-violet-50 text-violet-700', bar: '#7d52c4' },
  projekt: { label: 'Projekt', chip: 'bg-sky-50 text-sky-800', bar: '#2f66c9' },
  intern: { label: 'Intern', chip: 'bg-gray-100 text-gray-700', bar: '#7a726e' },
};

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: string) => new Date(`${k}T12:00:00`);
const uhrzeit = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

/** 6 Wochen ab dem Montag vor dem Monatsersten */
function gridDays(monat: Date): Date[] {
  const first = new Date(monat.getFullYear(), monat.getMonth(), 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  const all = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  // Letzte Woche weglassen, wenn sie komplett im Folgemonat liegt
  return all[35].getMonth() !== monat.getMonth() ? all.slice(0, 35) : all;
}

function relTag(k: string, heute: string): string {
  const diff = Math.round((fromKey(k).getTime() - fromKey(heute).getTime()) / 864e5);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  return fromKey(k).toLocaleDateString('de-DE', { weekday: 'long' });
}

export function KalenderClient({ meId }: { meId: string }) {
  const [heute] = useState(() => dayKey(new Date()));
  const [monat, setMonat] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1, 12);
  });
  const [tag, setTag] = useState(heute);
  const [person, setPerson] = useState('alle');
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => gridDays(monat), [monat]);
  const von = dayKey(days[0]);
  // Rechte Spalte zeigt auch „Demnächst“ – deshalb mindestens 14 Tage über heute hinaus laden
  const bisGrid = dayKey(days[days.length - 1]);
  const bisDemnaechst = dayKey(new Date(fromKey(heute).getTime() + 14 * 864e5));
  const bis = bisGrid > bisDemnaechst ? bisGrid : bisDemnaechst;
  const vonLaden = von < heute ? von : heute;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/team/calendar?von=${vonLaden}&bis=${bis}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (cancelled) return;
        setEntries(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [vonLaden, bis]);

  // Personen-Filter: Termine haben keinen Zuständigen und bleiben immer sichtbar
  const leute = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) for (const p of e.personen) m.set(p.id, p.name);
    return [...m.entries()].sort((a, b) => (a[0] === meId ? -1 : b[0] === meId ? 1 : a[1].localeCompare(b[1])));
  }, [entries, meId]);
  const sichtbar = entries.filter((e) => person === 'alle' || e.kind === 'termin' || e.personen.some((p) => p.id === person));
  const proTag = useMemo(() => {
    const m = new Map<string, CalendarEntry[]>();
    for (const e of sichtbar) m.set(e.tag, [...(m.get(e.tag) ?? []), e]);
    return m;
  }, [sichtbar]);

  const tagEintraege = proTag.get(tag) ?? [];
  const demnaechst = sichtbar.filter((e) => e.tag > tag).slice(0, 6);
  const monatsName = monat.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  const springeHeute = () => {
    const d = new Date();
    setMonat(new Date(d.getFullYear(), d.getMonth(), 1, 12));
    setTag(heute);
  };
  const blaettern = (delta: number) => setMonat((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1, 12));

  return (
    <div>
      <PageHeader
        title="Kalender"
        description="Termine und Fristen des ganzen Teams."
        action={
          <Button variant="secondary" size="lg" onClick={springeHeute}>
            <CalendarDays /> Heute
          </Button>
        }
      />

      {leute.length > 0 && (
        <div className="mb-5">
          <SegmentedControl
            items={[
              { value: 'alle', label: 'Alle' },
              ...leute.map(([id, name]) => ({ value: id, label: id === meId ? 'Ich' : name.split(' ')[0] })),
            ]}
            value={person}
            onChange={setPerson}
          />
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Monat */}
        <Card className="p-4 md:p-[22px]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[24px] font-medium capitalize tracking-[-0.03em] md:text-[28px]">{monatsName}</h2>
            <div className="flex gap-2">
              <button
                onClick={() => blaettern(-1)}
                aria-label="Vorheriger Monat"
                className="grid h-11 w-11 place-items-center rounded-full bg-panel transition-colors hover:bg-gray-200"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => blaettern(1)}
                aria-label="Nächster Monat"
                className="grid h-11 w-11 place-items-center rounded-full bg-panel transition-colors hover:bg-gray-200"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-1.5 md:gap-2">
            {WOCHENTAGE.map((w) => (
              <div key={w} className="pb-1 text-center text-xs font-medium uppercase tracking-[0.06em] text-gray-600">
                {w}
              </div>
            ))}
            {days.map((d, i) => {
              const k = dayKey(d);
              const imMonat = d.getMonth() === monat.getMonth();
              const istHeute = k === heute;
              const gewaehlt = k === tag;
              const list = proTag.get(k) ?? [];
              const spaet = list.some((e) => e.ueberfaellig);
              return (
                <button
                  key={k}
                  onClick={() => setTag(k)}
                  aria-label={`${d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}, ${list.length} Einträge`}
                  aria-pressed={gewaehlt}
                  className={`fx-rise flex min-h-[58px] flex-col items-start rounded-[14px] p-1.5 text-left transition-[box-shadow,background] md:min-h-[108px] md:p-2.5 ${
                    gewaehlt ? 'bg-red-50 shadow-[inset_0_0_0_2px_var(--r-700)]' : imMonat ? 'bg-panel hover:bg-gray-100' : 'bg-transparent'
                  }`}
                  style={{ '--d': `${60 + i * 8}ms` } as React.CSSProperties}
                >
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-[14px] md:h-8 md:w-8 md:text-[15px] ${
                      istHeute ? 'bg-gradient-to-b from-red-700 to-red-950 font-semibold text-red-50' : imMonat ? 'font-medium text-ink' : 'text-gray-400'
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {/* Handy: Punkte, Desktop: Chips */}
                  {list.length > 0 && (
                    <span className="mt-1 flex gap-0.5 md:hidden">
                      {list.slice(0, 3).map((e) => (
                        <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ background: e.ueberfaellig ? '#c42b23' : KIND[e.kind].bar }} />
                      ))}
                    </span>
                  )}
                  <span className="mt-1.5 hidden w-full space-y-1 md:block">
                    {list.slice(0, 2).map((e) => (
                      <span
                        key={e.id}
                        className={`block truncate rounded-[7px] px-1.5 py-0.5 text-[12px] font-medium ${KIND[e.kind].chip} ${
                          e.ueberfaellig ? 'shadow-[inset_0_0_0_1px_#c42b23]' : ''
                        }`}
                      >
                        {e.titel}
                      </span>
                    ))}
                    {list.length > 2 && (
                      <span className={`block px-1 text-[11.5px] ${spaet ? 'font-semibold text-red-700' : 'text-gray-600'}`}>
                        +{list.length - 2} weitere
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-gray-600">
            {(Object.keys(KIND) as CalendarKind[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND[k].bar }} /> {KIND[k].label}
              </span>
            ))}
            {loading && <span className="ml-auto">Lädt…</span>}
          </div>
        </Card>

        {/* Gewählter Tag + Demnächst */}
        <div className="grid gap-4">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-red-700">
              {relTag(tag, heute)} · {fromKey(tag).toLocaleDateString('de-DE', { weekday: 'long' })}
            </p>
            <p className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.035em]">
              {fromKey(tag).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}
            </p>
            {tagEintraege.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">Nichts geplant.</p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {tagEintraege.map((e) => (
                  <EntryBlock key={e.id} e={e} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="text-[19px] font-medium tracking-[-0.02em]">Demnächst</h2>
            {demnaechst.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">In den nächsten Tagen steht nichts an.</p>
            ) : (
              <ul className="mt-4 space-y-3.5">
                {demnaechst.map((e) => (
                  <li key={e.id}>
                    <button onClick={() => { setTag(e.tag); const d = fromKey(e.tag); setMonat(new Date(d.getFullYear(), d.getMonth(), 1, 12)); }} className="flex w-full items-center gap-3.5 text-left">
                      <span className="grid w-[58px] flex-none place-items-center rounded-[14px] bg-panel py-1.5">
                        <span className="text-[11px] font-medium uppercase text-red-700">
                          {fromKey(e.tag).toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')}
                        </span>
                        <span className="text-[20px] font-semibold leading-tight">{fromKey(e.tag).getDate()}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{e.titel}</span>
                        <span className="block truncate text-[13px] text-gray-600">
                          {relTag(e.tag, heute)}
                          {e.start ? ` · ${uhrzeit(e.start)}` : ` · ${KIND[e.kind].label}`}
                          {e.untertitel ? ` · ${e.untertitel}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function EntryBlock({ e }: { e: CalendarEntry }) {
  const body = (
    <div className="flex gap-3.5 rounded-[14px] bg-panel py-3 pl-4 pr-3" style={{ boxShadow: `inset 4px 0 0 ${e.ueberfaellig ? '#c42b23' : KIND[e.kind].bar}` }}>
      <div className="w-[60px] flex-none text-[13px] leading-snug text-gray-600">
        {e.start ? (
          <>
            <span className="block text-[14px] font-medium text-ink">{uhrzeit(e.start)}</span>
            {e.ende && <span className="block">{uhrzeit(e.ende)}</span>}
          </>
        ) : (
          <span className="block font-medium">Frist</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-snug">{e.titel}</p>
        <p className="mt-0.5 truncate text-[13px] text-red-800">
          {KIND[e.kind].label}
          {e.untertitel ? ` · ${e.untertitel}` : ''}
        </p>
        {e.ueberfaellig && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-700">
            <AlertTriangle className="h-3 w-3" /> überfällig
          </p>
        )}
        {e.personen.length > 0 && (
          <div className="mt-2 flex -space-x-2">
            {e.personen.map((p) => (
              <span key={p.id} title={p.name} className="rounded-full shadow-[0_0_0_2px_var(--panel)]">
                <Avatar name={p.name} src={p.avatar_url} size={30} />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
  return <li>{e.href ? <Link href={e.href} className="block transition-opacity hover:opacity-85">{body}</Link> : body}</li>;
}
