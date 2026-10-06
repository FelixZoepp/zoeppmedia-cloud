'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  CalendarClock,
  ChevronRight,
  ExternalLink,
  FileText,
  Phone,
  PhoneCall,
  PhoneMissed,
  PhoneOutgoing,
  Play,
  Repeat,
  SkipForward,
  UserPlus,
} from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import type { DialerQueueItem, QueueReason } from '@/lib/dialer/queue';

/* ------------------------------------------------------------------ */
/*  Typen & Konstanten                                                 */
/* ------------------------------------------------------------------ */

interface AgencyMeta {
  name: string;
  outbound_phone: string | null;
}

interface DialerData {
  queue: DialerQueueItem[];
  agencies: Record<string, AgencyMeta>;
  scripts: Record<string, Record<string, string>>;
  stats: { total: number; erinnerungen: number; kadenz: number; rueckrufe: number; neue: number };
  einKunde: boolean;
  schreiben: boolean;
}

interface CallLog {
  id: string;
  result: string;
  notes: string | null;
  created_at: string;
}

export type DialerModus = 'portal' | 'intern';

const ERGEBNISSE: { value: string; label: string }[] = [
  { value: 'termin_vereinbart', label: 'Termin vereinbart' },
  { value: 'nicht_erreicht', label: 'Nicht erreicht / Mailbox' },
  { value: 'rueckruf', label: 'Rückruf gewünscht' },
  { value: 'kein_interesse', label: 'Kein Interesse' },
  { value: 'falsche_nummer', label: 'Falsche Nummer' },
  { value: 'sonstiges', label: 'Sonstiges' },
];
const ERGEBNIS_LABEL: Record<string, string> = Object.fromEntries(ERGEBNISSE.map((e) => [e.value, e.label]));

const GRUND: Record<QueueReason, { tone: 'accent' | 'softAccent' | 'neutral' | 'warning'; label: string }> = {
  erinnerung: { tone: 'accent', label: 'Termin-Erinnerung' },
  kadenz: { tone: 'warning', label: 'Nachfassen' },
  rueckruf: { tone: 'softAccent', label: 'Rückruf' },
  neu: { tone: 'neutral', label: 'Neu' },
};

const FENSTER: Record<string, string> = { morning: 'Vormittag', afternoon: 'Nachmittag', evening: 'Abend' };
const TERMIN: Record<string, string> = { vorstellungsgespraech: 'Vorstellungsgespräch', probetag: 'Probetag' };

function skriptFür(item: DialerQueueItem, scripts: DialerData['scripts']): string | null {
  const s = scripts[item.agency_id];
  if (!s) return null;
  if (item.reason === 'erinnerung') {
    return s[item.appointment_type === 'probetag' ? 'erinnerung_probetag' : 'erinnerung_vg'] ?? s.erstkontakt ?? null;
  }
  return s.erstkontakt ?? null;
}

function wartetSeit(iso: string, jetzt: number): string {
  const h = (jetzt - new Date(iso).getTime()) / 36e5;
  if (h < 1) return `seit ${Math.max(1, Math.round(h * 60))} Min.`;
  if (h < 24) return `seit ${Math.floor(h)} Std.`;
  const t = Math.floor(h / 24);
  return `seit ${t} ${t === 1 ? 'Tag' : 'Tagen'}`;
}

const morgen = () => new Date(Date.now() + 864e5).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/*  Hauptkomponente                                                    */
/* ------------------------------------------------------------------ */

export function DialerClient({ modus = 'intern' }: { modus?: DialerModus }) {
  const [data, setData] = useState<DialerData | null>(null);
  const [fehler, setFehler] = useState('');
  const [filter, setFilter] = useState<'alle' | QueueReason>('alle');
  const [aktuellId, setAktuellId] = useState<string | null>(null);
  const [übersprungen, setÜbersprungen] = useState<Set<string>>(() => new Set());
  const [jetzt, setJetzt] = useState(0);
  const aktuellRef = useRef<string | null>(null);
  const q = modus === 'intern' ? '?modus=intern' : '';

  const laden = useCallback(async () => {
    try {
      const res = await fetch(`/api/dialer/queue${q}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status === 401 ? 'Bitte neu einloggen.' : `Fehler ${res.status}`);
      setData(await res.json());
      setJetzt(Date.now());
      setFehler('');
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Warteschlange konnte nicht geladen werden');
    }
  }, [q]);

  useEffect(() => {
    const t0 = setTimeout(laden, 0);
    const t = setInterval(laden, 60_000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [laden]);

  /* ── Sperre ─────────────────────────────────────────────────── */

  const sperre = useCallback(
    async (candidateId: string, action: 'open' | 'release') => {
      const res = await fetch(`/api/dialer/lock${q}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: candidateId, action }),
        keepalive: action === 'release',
      }).catch(() => null);
      if (action === 'open' && res && res.status === 409) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toast.info(d.error ?? 'Wird gerade von jemand anderem angerufen.');
        return false;
      }
      return true;
    },
    [q],
  );

  // Beim Verlassen der Seite eigene Sperre lösen; solange offen alle 8 Min. verlängern
  useEffect(() => {
    const lösen = () => {
      const id = aktuellRef.current;
      if (!id) return;
      navigator.sendBeacon?.(
        `/api/dialer/lock${q}`,
        new Blob([JSON.stringify({ candidate_id: id, action: 'release' })], { type: 'application/json' }),
      );
    };
    const verlängern = setInterval(() => {
      if (aktuellRef.current) void sperre(aktuellRef.current, 'open');
    }, 8 * 60_000);
    window.addEventListener('pagehide', lösen);
    return () => {
      clearInterval(verlängern);
      window.removeEventListener('pagehide', lösen);
      lösen();
    };
  }, [q, sperre]);

  /* ── Navigation durch die Schlange ──────────────────────────── */

  const sichtbar = useMemo(
    () => (data?.queue ?? []).filter((i) => filter === 'alle' || i.reason === filter),
    [data, filter],
  );

  const öffnen = useCallback(
    async (id: string | null) => {
      const vorher = aktuellRef.current;
      if (vorher && vorher !== id) void sperre(vorher, 'release');
      // Kandidaten in Reihenfolge: gewünschter, danach der Rest – gesperrte werden übersprungen
      const reihe = id
        ? [id, ...sichtbar.map((i) => i.candidate_id).filter((x) => x !== id && !übersprungen.has(x))]
        : [];
      for (const kandidat of reihe.length ? reihe : [null]) {
        aktuellRef.current = kandidat;
        setAktuellId(kandidat);
        if (!kandidat || !data?.schreiben) return;
        if (await sperre(kandidat, 'open')) return;
        if (aktuellRef.current !== kandidat) return; // inzwischen etwas anderes gewählt
        setÜbersprungen((s) => new Set(s).add(kandidat));
      }
      aktuellRef.current = null;
      setAktuellId(null);
    },
    [data?.schreiben, sichtbar, sperre, übersprungen],
  );

  const nächster = useCallback(
    (ohneId: string | null, extraSkip?: string) => {
      const skip = new Set(übersprungen);
      if (extraSkip) skip.add(extraSkip);
      const rest = sichtbar.filter((i) => i.candidate_id !== ohneId && !skip.has(i.candidate_id));
      // erst Einträge nach dem aktuellen, dann von vorne
      const idx = sichtbar.findIndex((i) => i.candidate_id === ohneId);
      const danach = rest.filter((i) => sichtbar.indexOf(i) > idx);
      return (danach[0] ?? rest[0])?.candidate_id ?? null;
    },
    [sichtbar, übersprungen],
  );

  const überspringen = useCallback(() => {
    const id = aktuellRef.current;
    if (!id) return;
    setÜbersprungen((s) => new Set(s).add(id));
    void öffnen(nächster(id, id));
  }, [nächster, öffnen]);

  const erledigt = useCallback(
    (id: string) => {
      const next = nächster(id);
      aktuellRef.current = null; // Sperre hat der Server beim Protokollieren gelöst
      setData((prev) => {
        if (!prev) return prev;
        const queue = prev.queue.filter((i) => i.candidate_id !== id);
        return {
          ...prev,
          queue,
          stats: {
            total: queue.length,
            erinnerungen: queue.filter((i) => i.reason === 'erinnerung').length,
            kadenz: queue.filter((i) => i.reason === 'kadenz').length,
            rueckrufe: queue.filter((i) => i.reason === 'rueckruf').length,
            neue: queue.filter((i) => i.reason === 'neu').length,
          },
        };
      });
      void öffnen(next);
      if (!next) toast.success('Alles abtelefoniert 🎉');
    },
    [nächster, öffnen],
  );

  /* ── Render ─────────────────────────────────────────────────── */

  if (!data) {
    return fehler ? (
      <div className="max-w-6xl">
        <PageHeader label="ANRUF-MODUS" title="Anrufen" />
        <Card>
          <p className="text-sm text-red-700">{fehler}</p>
        </Card>
      </div>
    ) : (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
      </div>
    );
  }

  const aktuell = data.queue.find((i) => i.candidate_id === aktuellId) ?? null;
  const kundeName = data.einKunde ? data.agencies[Object.keys(data.agencies)[0]]?.name : null;
  const filterButtons: { value: 'alle' | QueueReason; label: string; count: number }[] = [
    { value: 'alle', label: 'Alle', count: data.stats.total },
    { value: 'erinnerung', label: 'Erinnerungen', count: data.stats.erinnerungen },
    { value: 'kadenz', label: 'Nachfassen', count: data.stats.kadenz },
    { value: 'rueckruf', label: 'Rückrufe', count: data.stats.rueckrufe },
    { value: 'neu', label: 'Neu', count: data.stats.neue },
  ];

  return (
    <div className="max-w-6xl">
      <PageHeader
        label="ANRUF-MODUS"
        title={modus === 'portal' ? 'Anrufen' : 'Call-Warteschlange'}
        description={
          data.einKunde
            ? `Bewerber${kundeName ? ` von ${kundeName}` : ''} der Reihe nach abtelefonieren – Termin-Erinnerungen zuerst, dann Nachfassen, Rückrufe und neue Bewerber.`
            : 'Termin-Erinnerungen, Nachfass-Anrufe, Rückrufe und neue Bewerber über alle Kunden.'
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kennzahl label="In der Schlange" value={data.stats.total} icon={<PhoneCall className="h-4 w-4" />} hero />
        <Kennzahl label="Erinnerungen" value={data.stats.erinnerungen} icon={<CalendarClock className="h-4 w-4" />} />
        <Kennzahl label="Nachfassen" value={data.stats.kadenz} icon={<PhoneMissed className="h-4 w-4" />} />
        <Kennzahl label="Rückrufe" value={data.stats.rueckrufe} icon={<Repeat className="h-4 w-4" />} />
        <Kennzahl label="Neue Bewerber" value={data.stats.neue} icon={<UserPlus className="h-4 w-4" />} />
      </div>

      {!data.schreiben && (
        <Card inset className="mb-4">
          <p className="text-[14px] text-gray-600">Du hast nur Lesezugriff – Anrufe protokollieren können Inhaber und Mitarbeiter des Kunden.</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Fokus: aktueller Bewerber */}
        <div className="min-w-0">
          {aktuell ? (
            <Fokus
              key={aktuell.candidate_id}
              item={aktuell}
              agency={data.agencies[aktuell.agency_id]}
              zeigeKunde={!data.einKunde}
              skript={skriptFür(aktuell, data.scripts)}
              schreiben={data.schreiben}
              modus={modus}
              jetzt={jetzt}
              onErledigt={erledigt}
              onÜberspringen={überspringen}
            />
          ) : (
            <Card hero padding="lg" className="flex flex-col items-start gap-4">
              <p className="text-[15px] text-red-100">
                {sichtbar.length
                  ? `${sichtbar.length} ${sichtbar.length === 1 ? 'Anruf wartet' : 'Anrufe warten'} – los geht's.`
                  : 'Keine offenen Anrufe – alles abtelefoniert.'}
              </p>
              <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">
                {sichtbar.length ? 'Anruf-Modus starten' : 'Alles erledigt 🎉'}
              </h2>
              {sichtbar.length > 0 && (
                <button
                  onClick={() => void öffnen(nächster(null))}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-red-50 px-6 text-[15px] font-semibold text-red-900 transition-transform hover:-translate-y-0.5"
                >
                  <Play className="h-4 w-4" /> Mit dem ersten Bewerber starten
                </button>
              )}
              <p className="text-[12.5px] text-red-200">Tastatur: 1–6 Ergebnis wählen · ⌘/Strg + Enter speichern & weiter</p>
            </Card>
          )}
        </div>

        {/* Warteschlange */}
        <Card padding="none" className="min-w-0 self-start overflow-hidden">
          <div className="flex flex-wrap gap-1.5 border-b border-hair p-3">
            {filterButtons.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  filter === f.value ? 'bg-gradient-to-b from-red-700 to-red-950 text-red-50' : 'bg-panel text-gray-700 hover:bg-gray-100'
                }`}
              >
                {f.label} {f.count}
              </button>
            ))}
          </div>
          {sichtbar.length === 0 ? (
            <p className="p-5 text-[14px] text-gray-500">Keine offenen Anrufe in dieser Ansicht.</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-hair overflow-y-auto">
              {sichtbar.map((i) => {
                const g = GRUND[i.reason];
                const aktiv = i.candidate_id === aktuellId;
                return (
                  <li key={i.candidate_id}>
                    <button
                      onClick={() => void öffnen(i.candidate_id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${aktiv ? 'bg-red-50' : 'hover:bg-panel'} ${
                        übersprungen.has(i.candidate_id) ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-medium">{i.name}</p>
                        <p className="truncate text-[12px] text-gray-500">
                          {!data.einKunde && `${data.agencies[i.agency_id]?.name ?? ''} · `}
                          {i.reason === 'erinnerung' && i.appointment_at
                            ? `${TERMIN[i.appointment_type ?? ''] ?? 'Termin'} ${new Date(i.appointment_at).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
                            : jetzt
                              ? `wartet ${wartetSeit(i.created_at, jetzt)}`
                              : ''}
                        </p>
                      </div>
                      <Badge tone={g.tone}>{g.label}</Badge>
                      <ChevronRight className="h-4 w-4 flex-none text-gray-400" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Kennzahl                                                           */
/* ------------------------------------------------------------------ */

function Kennzahl({ label, value, icon, hero = false }: { label: string; value: number; icon: React.ReactNode; hero?: boolean }) {
  return (
    <div className={`rounded-[18px] p-4 ${hero ? 'bg-gradient-to-b from-red-700 to-red-950 text-red-50' : 'bg-card shadow-sm'}`}>
      <p className={`flex items-center gap-1.5 text-[12.5px] ${hero ? 'text-red-100' : 'text-gray-600'}`}>
        {icon} {label}
      </p>
      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.03em]">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Fokus-Karte: ein Bewerber, Anruf + Ergebnis                        */
/* ------------------------------------------------------------------ */

function Fokus({
  item,
  agency,
  zeigeKunde,
  skript,
  schreiben,
  modus,
  jetzt,
  onErledigt,
  onÜberspringen,
}: {
  item: DialerQueueItem;
  agency: AgencyMeta | undefined;
  zeigeKunde: boolean;
  skript: string | null;
  schreiben: boolean;
  modus: DialerModus;
  jetzt: number;
  onErledigt: (id: string) => void;
  onÜberspringen: () => void;
}) {
  const [ergebnis, setErgebnis] = useState('');
  const [notiz, setNotiz] = useState('');
  const [rückrufAm, setRückrufAm] = useState(morgen);
  const [terminArt, setTerminArt] = useState<'vorstellungsgespraech' | 'probetag'>('vorstellungsgespraech');
  const [terminAm, setTerminAm] = useState('');
  const [skriptOffen, setSkriptOffen] = useState(false);
  const [verlauf, setVerlauf] = useState<CallLog[] | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState('');
  const g = GRUND[item.reason];

  useEffect(() => {
    let ab = false;
    fetch(`/api/candidates/${item.candidate_id}/calls`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => !ab && setVerlauf(Array.isArray(d) ? d.slice(0, 3) : []))
      .catch(() => !ab && setVerlauf([]));
    return () => {
      ab = true;
    };
  }, [item.candidate_id]);

  const speichern = useCallback(async () => {
    if (!ergebnis || speichert) return;
    if (ergebnis === 'termin_vereinbart' && !terminAm) {
      setFehler('Bitte Datum und Uhrzeit für den Termin angeben.');
      return;
    }
    setSpeichert(true);
    setFehler('');
    try {
      const res = await fetch(`/api/candidates/${item.candidate_id}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: ergebnis,
          notes: notiz.trim() || null,
          next_step: ergebnis === 'rueckruf' ? 'erneut_anrufen' : null,
          next_contact_date: ergebnis === 'rueckruf' ? rückrufAm : null,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? 'Speichern fehlgeschlagen');
      }
      if (ergebnis === 'termin_vereinbart') {
        const t = await fetch(`/api/candidates/${item.candidate_id}/appointments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: terminArt, scheduled_at: new Date(terminAm).toISOString(), notes: notiz.trim() || null }),
        });
        if (!t.ok) throw new Error('Anruf gespeichert, aber der Termin konnte nicht angelegt werden');
      }
      if (item.reason === 'erinnerung' && item.appointment_id) {
        await fetch(`/api/appointments/${item.appointment_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reminder_done: true }),
        }).catch(() => {});
      }
      toast.success(`${item.name}: ${ERGEBNIS_LABEL[ergebnis]}`);
      onErledigt(item.candidate_id);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler');
      setSpeichert(false);
    }
  }, [ergebnis, speichert, terminAm, item, notiz, rückrufAm, terminArt, onErledigt]);

  // Tastatur: 1–6 Ergebnis, ⌘/Strg+Enter speichern & weiter
  useEffect(() => {
    if (!schreiben) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void speichern();
        return;
      }
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= ERGEBNISSE.length) setErgebnis(ERGEBNISSE[n - 1].value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [schreiben, speichern]);

  return (
    <Card padding="lg" className="fx-rise">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={g.tone}>
          {g.label}
          {item.reason === 'kadenz' && item.cadence_attempt != null && ` · Versuch ${item.cadence_attempt + 1}`}
        </Badge>
        {zeigeKunde && agency && <span className="text-[12.5px] text-gray-500">{agency.name}</span>}
        {modus === 'portal' && (
          <Link
            href={`/candidates/${item.candidate_id}`}
            className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-red-800 hover:underline"
          >
            Bewerber öffnen <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      <h2 className="mt-3 break-words text-[28px] font-semibold leading-tight tracking-[-0.03em]">{item.name}</h2>
      <p className="mt-1 text-[13.5px] text-gray-600">
        {item.reason === 'erinnerung' && item.appointment_at ? (
          <span className="font-medium text-red-800">
            {TERMIN[item.appointment_type ?? ''] ?? 'Termin'} am{' '}
            {new Date(item.appointment_at).toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr
          </span>
        ) : jetzt ? (
          `Beworben ${wartetSeit(item.created_at, jetzt)}`
        ) : null}
        {item.reason === 'kadenz' && item.cadence_window && ` · am besten ${FENSTER[item.cadence_window] ?? item.cadence_window}`}
        {item.reason === 'rueckruf' && item.callback_date && ` · Rückruf fällig ${new Date(item.callback_date).toLocaleDateString('de-DE')}`}
      </p>
      {item.callback_note && <p className="mt-2 rounded-[12px] bg-panel px-3 py-2 text-[13.5px] text-gray-700">„{item.callback_note}“</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {item.phone ? (
          <a
            href={`tel:${item.phone}`}
            className="inline-flex h-14 items-center gap-2.5 rounded-full bg-gradient-to-b from-green-600 to-green-700 px-6 text-[17px] font-semibold text-white shadow-[0_12px_28px_-14px_#15803d] transition-transform hover:-translate-y-0.5"
          >
            <Phone className="h-5 w-5" /> {item.phone}
          </a>
        ) : (
          <span className="text-[14px] text-gray-500">Keine Nummer hinterlegt</span>
        )}
        {skript && (
          <button
            onClick={() => setSkriptOffen((v) => !v)}
            className={`inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition-colors ${
              skriptOffen ? 'bg-red-50 text-red-800' : 'bg-panel text-gray-700 hover:bg-gray-100'
            }`}
          >
            <FileText className="h-4 w-4" /> Skript
          </button>
        )}
      </div>
      {agency?.outbound_phone && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-gray-500">
          <PhoneOutgoing className="h-3.5 w-3.5" /> Anrufen mit: <strong className="font-semibold text-gray-700">{agency.outbound_phone}</strong>
        </p>
      )}

      {skriptOffen && skript && (
        <div className="mt-4 rounded-[16px] bg-panel p-4">
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-gray-800">{skript}</p>
        </div>
      )}

      {verlauf && verlauf.length > 0 && (
        <div className="mt-4">
          <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-gray-500">Letzte Anrufe</p>
          <ul className="mt-1.5 space-y-1">
            {verlauf.map((v) => (
              <li key={v.id} className="text-[13px] text-gray-700">
                <span className="text-gray-500">{new Date(v.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span> ·{' '}
                {ERGEBNIS_LABEL[v.result] ?? v.result}
                {v.notes && <span className="text-gray-500"> – {v.notes}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {schreiben ? (
        <div className="mt-5 border-t border-hair pt-5">
          <p className="mb-2 text-[13px] font-medium text-gray-600">Ergebnis</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ERGEBNISSE.map((e, i) => (
              <button
                key={e.value}
                onClick={() => setErgebnis(e.value)}
                className={`flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left text-[14px] transition-colors ${
                  ergebnis === e.value
                    ? 'bg-gradient-to-b from-red-700 to-red-950 font-medium text-red-50'
                    : 'bg-panel text-gray-800 hover:bg-gray-100'
                }`}
              >
                <kbd
                  className={`grid h-6 w-6 flex-none place-items-center rounded-md text-[12px] font-semibold ${
                    ergebnis === e.value ? 'bg-white/20 text-red-50' : 'bg-card text-gray-500 shadow-[inset_0_0_0_1px_var(--hair)]'
                  }`}
                >
                  {i + 1}
                </kbd>
                {e.label}
              </button>
            ))}
          </div>

          {ergebnis === 'termin_vereinbart' && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[14px] bg-green-50 p-3">
              <CalendarClock className="h-4 w-4 text-green-700" />
              <select
                value={terminArt}
                onChange={(e) => setTerminArt(e.target.value as 'vorstellungsgespraech' | 'probetag')}
                className="h-10 rounded-[12px] bg-card px-3 text-[14px] shadow-[inset_0_0_0_1.5px_var(--hair)]"
              >
                <option value="vorstellungsgespraech">Vorstellungsgespräch</option>
                <option value="probetag">Probetag</option>
              </select>
              <input
                type="datetime-local"
                value={terminAm}
                onChange={(e) => setTerminAm(e.target.value)}
                className="h-10 min-w-0 rounded-[12px] bg-card px-3 text-[14px] shadow-[inset_0_0_0_1.5px_var(--hair)]"
              />
            </div>
          )}
          {ergebnis === 'rueckruf' && (
            <label className="mt-3 flex flex-wrap items-center gap-2 rounded-[14px] bg-panel p-3 text-[14px] text-gray-700">
              Rückruf am
              <input
                type="date"
                value={rückrufAm}
                onChange={(e) => setRückrufAm(e.target.value)}
                className="h-10 rounded-[12px] bg-card px-3 text-[14px] shadow-[inset_0_0_0_1.5px_var(--hair)]"
              />
            </label>
          )}

          <textarea
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            rows={2}
            placeholder="Notiz zum Anruf (optional)"
            className="mt-3 w-full resize-y rounded-[14px] bg-card px-3.5 py-2.5 text-[14px] shadow-[inset_0_0_0_1.5px_var(--hair)] outline-none placeholder:text-gray-400 focus:shadow-[inset_0_0_0_1.5px_var(--r-700)]"
          />
          {fehler && <p className="mt-2 text-[13px] text-red-700">{fehler}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => void speichern()} disabled={!ergebnis || speichert}>
              {speichert ? 'Speichern …' : 'Speichern & weiter'}
              <span className="hidden text-[12px] opacity-70 sm:inline">⌘↵</span>
            </Button>
            <Button variant="secondary" onClick={onÜberspringen} disabled={speichert}>
              <SkipForward /> Überspringen
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex border-t border-hair pt-5">
          <Button variant="secondary" onClick={onÜberspringen}>
            <SkipForward /> Nächster
          </Button>
        </div>
      )}
    </Card>
  );
}
