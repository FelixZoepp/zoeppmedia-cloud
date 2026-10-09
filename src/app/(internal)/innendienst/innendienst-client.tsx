'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Inbox, Link2, MessageCircle, PhoneCall, RefreshCw, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Button, Card, Input, PageHeader, SegmentedControl, StatCard } from '@/components/ui';
import type { KundeArbeit } from '@/lib/kunden-cloud/uebersicht';
import { GarantieBalken } from '@/components/garantie/garantie-balken';
import { ZahlenTab } from './zahlen-tab';

const PHASE: Record<string, string> = {
  zahlung: 'Zahlung',
  onboarding: 'Onboarding',
  setup: 'Setup',
  continuity: 'Kampagne läuft',
  offboarding: 'Offboarding',
};

/** „seit 3 Std.“ / „seit 2 Tagen“ */
function wartet(iso: string | null, jetzt: number): string | null {
  if (!iso) return null;
  const h = (jetzt - new Date(iso).getTime()) / 36e5;
  if (h < 1) return 'seit < 1 Std.';
  if (h < 24) return `seit ${Math.floor(h)} Std.`;
  const t = Math.floor(h / 24);
  return `seit ${t} ${t === 1 ? 'Tag' : 'Tagen'}`;
}

/** Link, der das Kunden-Cookie setzt und direkt in die Cloud springt */
const login = (id: string, ziel: string) => `/api/admin/impersonate?agency=${id}&ziel=${encodeURIComponent(ziel)}`;

export function InnendienstClient({ vorname }: { vorname: string }) {
  const [kunden, setKunden] = useState<KundeArbeit[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [filter, setFilter] = useState('arbeit');
  const [lädt, setLädt] = useState(false);
  // Zeitpunkt der letzten Ladung – Basis für „wartet seit …“
  const [stand, setStand] = useState(0);

  const laden = useCallback(async () => {
    setLädt(true);
    try {
      const res = await fetch('/api/innendienst', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Fehler');
      setKunden(data.kunden);
      setStand(Date.now());
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Übersicht konnte nicht geladen werden');
    } finally {
      setLädt(false);
    }
  }, []);

  useEffect(() => {
    // erste Ladung + jede Minute aktualisieren (neue Bewerber kommen laufend rein)
    const t0 = setTimeout(laden, 0);
    const t = setInterval(laden, 60_000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [laden]);

  const liste = (kunden ?? []).filter((k) => {
    if (suche && !k.name.toLowerCase().includes(suche.toLowerCase())) return false;
    if (filter === 'arbeit') return k.zuBearbeiten + k.anrufeFaellig + k.ungelesen > 0;
    return true;
  });
  const summe = (f: (k: KundeArbeit) => number) => (kunden ?? []).reduce((n, k) => n + f(k), 0);
  const mitArbeit = (kunden ?? []).filter((k) => k.zuBearbeiten + k.anrufeFaellig + k.ungelesen > 0).length;

  return (
    <div>
      <PageHeader
        label="INNENDIENST"
        title={vorname ? `Hallo ${vorname}` : 'Innendienst'}
        description="Alle Kunden auf einen Blick – mit einem Klick in die Cloud des Kunden und loslegen."
        action={
          <Button variant="secondary" onClick={laden} disabled={lädt} aria-label="Aktualisieren">
            <RefreshCw className={lädt ? 'animate-spin' : ''} />
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard hero title="Neue Bewerber zu bearbeiten" value={summe((k) => k.zuBearbeiten)} note={`bei ${mitArbeit} von ${kunden?.length ?? 0} Kunden`} icon={<UserPlus />} />
        <StatCard title="Noch kein Kontakt" value={summe((k) => k.ohneKontakt)} note="Speed-to-Lead: zuerst anrufen" icon={<AlertTriangle />} />
        <StatCard title="Anrufe fällig" value={summe((k) => k.anrufeFaellig)} note="laut Nachfass-Rhythmus" icon={<PhoneCall />} />
        <StatCard title="Ungelesene Nachrichten" value={summe((k) => k.ungelesen)} note="WhatsApp" icon={<MessageCircle />} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className={`w-full sm:w-72 ${filter === 'zahlen' ? 'hidden' : ''}`}>
          <Input pill icon={<Search />} placeholder="Kunde suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        </div>
        <SegmentedControl
          items={[
            { value: 'arbeit', label: `Mit Arbeit (${mitArbeit})` },
            { value: 'alle', label: `Alle Kunden (${kunden?.length ?? 0})` },
            { value: 'zahlen', label: 'Zahlen' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {fehler && (
        <Card className="mb-4 flex items-start gap-3 text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
          <p className="text-[14px]">{fehler}</p>
        </Card>
      )}

      {filter === 'zahlen' ? (
        <ZahlenTab />
      ) : !kunden ? (
        !fehler && (
          <div className="flex justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
          </div>
        )
      ) : liste.length === 0 ? (
        <Card inset>
          <p className="py-10 text-center text-[15px] text-gray-600">
            {filter === 'arbeit' && !suche ? 'Alles abgearbeitet – bei keinem Kunden wartet gerade etwas. 🎉' : 'Kein Kunde gefunden.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {liste.map((k, i) => (
            <KundeKarte key={k.id} k={k} index={i} jetzt={stand} />
          ))}
        </div>
      )}
    </div>
  );
}

function KundeKarte({ k, index, jetzt }: { k: KundeArbeit; index: number; jetzt: number }) {
  const seit = wartet(k.aeltesterOhneKontakt, jetzt);
  const dringend = k.ohneKontakt > 0 && !!k.aeltesterOhneKontakt && jetzt - new Date(k.aeltesterOhneKontakt).getTime() > 24 * 36e5;
  const zahlen = [
    { l: 'zu bearbeiten', n: k.zuBearbeiten, warn: false },
    { l: 'ohne Kontakt', n: k.ohneKontakt, warn: k.ohneKontakt > 0 },
    { l: 'Anrufe fällig', n: k.anrufeFaellig, warn: k.anrufeFaellig > 0 },
    { l: 'ungelesen', n: k.ungelesen, warn: k.ungelesen > 0 },
  ];
  return (
    <Card className={`fx-rise fx-lift flex flex-col ${k.pausiert ? 'opacity-70' : ''}`} style={{ '--d': `${Math.min(index, 12) * 40}ms` } as React.CSSProperties}>
      <div className="flex items-center gap-3.5">
        <Avatar name={k.name} src={k.logo_url} size={48} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-medium tracking-[-0.02em]">{k.name}</h2>
          <p className="text-[13px] text-gray-600">
            {k.pausiert ? 'Pausiert' : (k.phase && PHASE[k.phase]) || 'Kunde'}
            {k.neuHeute > 0 && <span className="font-medium text-green-700"> · {k.neuHeute} heute neu</span>}
            {k.neuHeute === 0 && k.neu7Tage > 0 && <span> · {k.neu7Tage} in 7 Tagen</span>}
          </p>
        </div>
        {k.slug && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(`${window.location.origin}/k/${k.slug}`);
              toast.success('Login-Link für den Kunden kopiert');
            }}
            title="Login-Link für den Kunden kopieren"
            aria-label={`Login-Link für ${k.name} kopieren`}
            className="grid h-9 w-9 flex-none place-items-center rounded-full text-gray-500 hover:bg-panel hover:text-ink"
          >
            <Link2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 rounded-[16px] bg-panel p-3 text-center">
        {zahlen.map((z) => (
          <div key={z.l}>
            <p className={`text-[22px] font-semibold leading-none tracking-[-0.03em] ${z.n === 0 ? 'text-gray-400' : z.warn ? 'text-red-700' : 'text-ink'}`}>{z.n}</p>
            <p className="mt-1 text-[11.5px] leading-tight text-gray-600">{z.l}</p>
          </div>
        ))}
      </div>

      <p className={`mt-3 min-h-[18px] text-[12.5px] ${dringend ? 'font-medium text-red-700' : 'text-gray-500'}`}>
        {seit && k.ohneKontakt > 0 ? (
          <>
            {dringend && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />}
            Ältester Bewerber ohne Kontakt wartet {seit}
          </>
        ) : k.zuBearbeiten + k.anrufeFaellig + k.ungelesen === 0 ? (
          'Nichts offen'
        ) : null}
      </p>

      {k.garantie && (
        <div className="mt-2">
          <GarantieBalken ampel={k.garantie.ampel} ist={k.garantie.ist} ziel={k.garantie.ziel} kompakt />
        </div>
      )}

      <div className="mt-auto grid grid-cols-[1fr_auto] gap-2 pt-4">
        <a
          href={login(k.id, '/candidates')}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-b from-red-700 to-red-950 px-5 text-[15px] font-medium text-red-50 shadow-[0_10px_24px_-12px_#7f1d1d] transition-transform hover:-translate-y-0.5"
        >
          In Cloud einloggen <ArrowRight className="h-4 w-4" />
        </a>
        <a
          href={login(k.id, '/inbox')}
          title="Direkt in die WhatsApp-Inbox"
          aria-label={`Inbox von ${k.name} öffnen`}
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink shadow-[inset_0_0_0_1.5px_var(--hair)] hover:bg-red-50"
        >
          <Inbox className="h-[18px] w-[18px]" />
          {k.ungelesen > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-700 px-1 text-[11px] font-semibold text-white">{k.ungelesen}</span>
          )}
        </a>
      </div>
    </Card>
  );
}
