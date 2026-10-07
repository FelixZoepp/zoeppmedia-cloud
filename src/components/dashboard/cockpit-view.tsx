'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Clock, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input, PageHeader, StatCard } from '@/components/ui';
import type { Ausnahme, CockpitDaten, CockpitPunkt } from '@/lib/cockpit/laden';

interface VertriebZiel {
  ziel: { ziel: number; erreicht: number; prozent: number; aufKurs: number | null; forecast: number; rest: number; tageImMonat: number; vergangeneTage: number };
  probleme?: Array<{ stufe: 'kritisch' | 'wichtig' | 'hinweis'; titel: string; detail: string }>;
}

const euro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;
const datum = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

function AusnahmeZeile({ a }: { a: Ausnahme }) {
  const inhalt = (
    <>
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${a.stufe === 'rot' ? 'bg-red-600' : 'bg-amber-500'}`} />
      <span className="w-[86px] shrink-0 text-[12px] font-medium uppercase tracking-wide text-gray-500">{a.bereich}</span>
      <span className="min-w-0 flex-1 text-[14px] leading-snug text-gray-900">{a.text}</span>
      {a.link && <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />}
    </>
  );
  return a.link ? (
    <li>
      <Link href={a.link} className="flex gap-3 rounded-lg px-2 py-2 hover:bg-gray-50">{inhalt}</Link>
    </li>
  ) : (
    <li className="flex gap-3 px-2 py-2">{inhalt}</li>
  );
}

function PunktZeile({ p, onPatch }: { p: CockpitPunkt; onPatch: (id: string, patch: Record<string, string>) => Promise<void> }) {
  const offen = p.status === 'offen';
  const STATUS: Record<string, string> = { ja: 'Ja', nein: 'Nein', erledigt: 'Erledigt', verschoben: 'Verschoben' };
  return (
    <li className={`rounded-xl border p-3 ${offen ? 'border-gray-200 bg-white' : 'border-transparent bg-gray-50 text-gray-500'}`}>
      <div className="flex flex-wrap items-start gap-2">
        <p className="min-w-0 flex-1 text-[14.5px] font-medium">{p.titel}</p>
        {!offen && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[12px] font-semibold text-gray-700">{STATUS[p.status]}</span>}
      </div>
      {p.empfehlung && <p className="mt-1 text-[13.5px] text-gray-700"><strong className="font-semibold">Empfehlung:</strong> {p.empfehlung}</p>}
      <p className="mt-1 text-[12.5px] text-gray-500">
        {[p.owner_name && `Verantwortlich: ${p.owner_name}`, p.faellig_am && `bis ${datum(p.faellig_am)}`, p.erstellt_von_name && `von ${p.erstellt_von_name}`].filter(Boolean).join(' · ')}
      </p>
      {offen && (
        <div className="mt-2 flex flex-wrap gap-2">
          {p.typ === 'entscheidung' ? (
            <>
              <Button size="sm" onClick={() => onPatch(p.id, { status: 'ja' })}><Check className="h-4 w-4" /> Ja</Button>
              <Button size="sm" variant="secondary" onClick={() => onPatch(p.id, { status: 'nein' })}><X className="h-4 w-4" /> Nein</Button>
            </>
          ) : (
            <Button size="sm" onClick={() => onPatch(p.id, { status: 'erledigt' })}><Check className="h-4 w-4" /> Erledigt</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onPatch(p.id, { status: 'verschoben' })}><Clock className="h-4 w-4" /> Verschieben</Button>
        </div>
      )}
    </li>
  );
}

function NeuerPunkt({ typ, personen, onAdd }: { typ: 'entscheidung' | 'prioritaet'; personen: CockpitDaten['personen']; onAdd: (b: Record<string, string>) => Promise<void> }) {
  const [titel, setTitel] = useState('');
  const [zusatz, setZusatz] = useState('');
  const [owner, setOwner] = useState('');
  const [faellig, setFaellig] = useState('');
  return (
    <form
      className="mt-3 space-y-2 border-t border-gray-100 pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!titel.trim()) return;
        await onAdd({ typ, titel, ...(typ === 'entscheidung' ? { empfehlung: zusatz } : {}), owner_user_id: owner, faellig_am: faellig });
        setTitel('');
        setZusatz('');
        setOwner('');
        setFaellig('');
      }}
    >
      <Input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder={typ === 'entscheidung' ? 'Was soll entschieden werden?' : 'Neue Priorität für diese Woche'} />
      {typ === 'entscheidung' && <Input value={zusatz} onChange={(e) => setZusatz(e.target.value)} placeholder="Empfehlung des Teams (optional)" />}
      <div className="flex flex-wrap gap-2">
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className="h-10 min-w-[170px] flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm">
          <option value="">Verantwortlich …</option>
          {personen.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" value={faellig} onChange={(e) => setFaellig(e.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
        <Button size="sm" type="submit" disabled={!titel.trim()}>Hinzufügen</Button>
      </div>
    </form>
  );
}

/** Admin-Cockpit: Zahlen → Ausnahmen → Entscheidungen → Prioritäten – das eine Meeting pro Woche */
export function CockpitView() {
  const [d, setD] = useState<CockpitDaten | null>(null);
  const [v, setV] = useState<VertriebZiel | null>(null);
  const [vFehler, setVFehler] = useState<string | null>(null);
  const [ki, setKi] = useState<{ ok: boolean; hinweis?: string; grund?: string } | null>(null);
  const [laedt, setLaedt] = useState(false);

  const laden = useCallback(async (neu = false) => {
    setLaedt(true);
    const [c] = await Promise.all([
      fetch('/api/admin/cockpit', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/admin/vertrieb?zeitraum=monat${neu ? '&neu=1' : ''}`, { cache: 'no-store' })
        .then(async (r) => {
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error ?? 'Vertrieb nicht verfügbar');
          setV(j);
          setVFehler(null);
        })
        .catch((e) => setVFehler(e instanceof Error ? e.message : 'Vertrieb nicht verfügbar')),
      fetch('/api/assistant/status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((k) => k && setKi(k)).catch(() => {}),
    ]);
    if (c) setD(c);
    setLaedt(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => laden(), 0);
    return () => clearTimeout(t);
  }, [laden]);

  const patch = async (id: string, body: Record<string, string>) => {
    const r = await fetch('/api/admin/cockpit', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) });
    if (!r.ok) toast.error('Konnte nicht gespeichert werden');
    await laden();
  };
  const neu = async (body: Record<string, string>) => {
    const r = await fetch('/api/admin/cockpit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) toast.error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Konnte nicht gespeichert werden');
    await laden();
  };

  if (!d) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-600" />
      </div>
    );
  }

  // Ausnahmen aus Vertrieb und System dazunehmen
  const ausnahmen: Ausnahme[] = [
    ...(ki && !ki.ok ? [{ stufe: 'rot' as const, bereich: 'System' as const, text: `KI läuft nicht – Generator, KI-Prüfung und Assistent stehen still. ${ki.hinweis ?? ''}`.trim() }] : []),
    ...(v?.probleme ?? [])
      .filter((p) => p.stufe !== 'hinweis')
      .map((p) => ({ stufe: p.stufe === 'kritisch' ? ('rot' as const) : ('gelb' as const), bereich: 'Vertrieb' as const, text: `${p.titel} – ${p.detail}`, link: '/admin/vertrieb' })),
    ...d.ausnahmen,
  ].sort((a, b) => Number(a.stufe === 'gelb') - Number(b.stufe === 'gelb'));
  const rot = ausnahmen.filter((a) => a.stufe === 'rot').length;
  const z = v?.ziel;
  const offeneEntscheidungen = d.entscheidungen.filter((p) => p.status === 'offen').length;

  return (
    <div className="space-y-6">
      <PageHeader
        label="COCKPIT"
        title="Cockpit"
        description={`Alles für dein Wochen-Meeting · Stand ${new Date(d.stand).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
        action={
          <Button variant="secondary" onClick={() => laden(true)} disabled={laedt}>
            <RefreshCw className={`h-4 w-4 ${laedt ? 'animate-spin' : ''}`} /> Aktualisieren
          </Button>
        }
      />

      {/* 1 · Zahlen */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          hero
          title="Auftragsvolumen diesen Monat"
          value={z ? euro(z.erreicht) : vFehler ? '–' : '…'}
          note={z ? `${z.prozent} % vom Ziel ${euro(z.ziel)} · Prognose ${euro(z.forecast)}${z.aufKurs !== null ? ` · ${z.aufKurs} % vom Soll bis heute` : ''}` : vFehler ?? 'lädt aus Close …'}
          href="/admin/vertrieb"
        />
        <StatCard
          title="MRR (gepflegt)"
          value={euro(d.mrr.summe)}
          note={`bei ${d.mrr.gepflegt} von ${d.mrr.gesamt} Kunden hinterlegt`}
          href="/admin/finanzen/kunden"
        />
        <StatCard
          title="Aktive Kunden"
          value={d.kunden.aktiv}
          note={`🟢 ${d.kunden.ampel.gruen} · 🟡 ${d.kunden.ampel.gelb} · 🔴 ${d.kunden.ampel.rot} · im Aufbau ${d.fulfillment.imAufbau}`}
          href="/ergebnisse"
        />
        <StatCard
          title="Neue Bewerber (7 Tage)"
          value={d.bewerber.woche}
          note={`Vorwoche ${d.bewerber.vorwoche}`}
          trend={d.bewerber.vorwoche ? Math.round(((d.bewerber.woche - d.bewerber.vorwoche) / d.bewerber.vorwoche) * 100) : undefined}
          href="/innendienst"
        />
        <StatCard
          title="Fulfillment überfällig"
          value={d.fulfillment.ueberfaelligTeam}
          note={`Team-Schritte · dazu ${d.fulfillment.ueberfaelligKunde} Kunden-Aufgaben`}
          href="/clients"
        />
        <StatCard
          title="Offen: Entscheidungen & Anfragen"
          value={offeneEntscheidungen}
          note={`Entscheidungen · ${d.anfragen.offen} Kunden-Anfragen (${d.anfragen.upsell} Upsell)`}
          href="/admin/support"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {/* 2 · Ausnahmen */}
          <Card>
            <h2 className="text-[19px] font-medium tracking-[-0.02em]">
              Ausnahmen <span className="text-[14px] font-normal text-gray-500">· {rot} rot, {ausnahmen.length - rot} gelb</span>
            </h2>
            <p className="mt-1 text-[13.5px] text-gray-600">Nur was nicht im Plan ist – pro Punkt: wer, was, bis wann.</p>
            {ausnahmen.length ? (
              <ul className="mt-2 divide-y divide-gray-100">{ausnahmen.map((a, i) => <AusnahmeZeile key={i} a={a} />)}</ul>
            ) : (
              <p className="mt-3 text-[14px] text-green-700">Keine Ausnahmen – alles im Plan.</p>
            )}
          </Card>

          {/* 3 · Entscheidungen */}
          <Card>
            <h2 className="text-[19px] font-medium tracking-[-0.02em]">Entscheidungen</h2>
            <p className="mt-1 text-[13.5px] text-gray-600">Das Team bereitet vor (mit Empfehlung), du entscheidest mit einem Klick.</p>
            <ul className="mt-3 space-y-2">
              {d.entscheidungen.length ? d.entscheidungen.map((p) => <PunktZeile key={p.id} p={p} onPatch={patch} />) : <li className="text-[14px] text-gray-500">Keine offenen Entscheidungen.</li>}
            </ul>
            <NeuerPunkt typ="entscheidung" personen={d.personen} onAdd={neu} />
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          {/* 4 · Prioritäten */}
          <Card>
            <h2 className="text-[19px] font-medium tracking-[-0.02em]">Prioritäten der Woche</h2>
            <p className="mt-1 text-[13.5px] text-gray-600">Höchstens 3 – jede mit verantwortlicher Person.</p>
            <ul className="mt-3 space-y-2">
              {d.prioritaeten.length ? d.prioritaeten.map((p) => <PunktZeile key={p.id} p={p} onPatch={patch} />) : <li className="text-[14px] text-gray-500">Noch keine Prioritäten gesetzt.</li>}
            </ul>
            <NeuerPunkt typ="prioritaet" personen={d.personen} onAdd={neu} />
          </Card>

          <Card>
            <h2 className="text-[17px] font-medium">Kampagnenstarts (7 Tage)</h2>
            <ul className="mt-2 space-y-1.5 text-[14px]">
              {d.fulfillment.starts7.length ? (
                d.fulfillment.starts7.map((s) => (
                  <li key={s.id} className="flex justify-between gap-2">
                    <Link href={`/clients/${s.id}`} className="truncate hover:text-red-700">{s.name}</Link>
                    <span className={s.datum < d.stand.slice(0, 10) ? 'text-red-700' : 'text-gray-500'}>{datum(s.datum)}</span>
                  </li>
                ))
              ) : (
                <li className="text-gray-500">Keine Starts geplant.</li>
              )}
            </ul>
          </Card>

          <Card>
            <h2 className="text-[17px] font-medium">Team</h2>
            <ul className="mt-2 space-y-1.5 text-[14px]">
              {d.team.map((t) => (
                <li key={t.user_id} className="flex justify-between gap-2">
                  <span className="truncate">{t.name}</span>
                  <span className={t.ueberfaellig ? 'font-semibold text-red-700' : 'text-gray-500'}>
                    {t.offen} offen{t.ueberfaellig ? ` · ${t.ueberfaellig} überfällig` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {d.wochenbericht && (
            <Card>
              <h2 className="text-[17px] font-medium">Kunden-Wochenberichte KW {d.wochenbericht.kw}</h2>
              <p className="mt-1 text-[14px] text-gray-700">
                🟢 {d.wochenbericht.auf_kurs} auf Kurs · 🟡 {d.wochenbericht.achtung} Achtung · 🔴 {d.wochenbericht.kritisch} kritisch
              </p>
              <Link href="/admin/wochenberichte" className="mt-1 inline-block text-[13.5px] font-semibold text-red-700">Zu den Berichten</Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
