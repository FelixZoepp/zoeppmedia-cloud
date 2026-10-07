'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, PlayCircle } from 'lucide-react';
import { Card, SegmentedControl } from '@/components/ui';
import type { GespraechAnalyse } from '@/lib/gespraeche/analyse';

interface Gespraech {
  fireflies_id: string;
  titel: string | null;
  datum: string | null;
  dauer_min: number | null;
  status: 'offen' | 'in_close' | 'kein_lead' | 'fehler' | 'uebersprungen';
  punkte: number | null;
  zuordnung: string | null;
  close_lead_id: string | null;
  fehler: string | null;
  ergebnis: GespraechAnalyse | null;
  ausgang: 'offen' | 'gewonnen' | 'verloren';
  ausgang_am: string | null;
}

const ART: Record<string, string> = { opening: 'Opening', setting: 'Setting', follow_up: 'Follow-up', closing: 'Closing', kunde: 'Kunde', intern: 'Intern', sonstiges: 'Sonstiges' };
const VERKAUF = ['opening', 'setting', 'follow_up', 'closing'];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const ff = (id: string, t?: number) => `https://app.fireflies.ai/view/${id}${t !== undefined ? `?t=${Math.floor(t)}` : ''}`;
const farbe = (p: number | null) => (p === null ? 'text-gray-400' : p >= 70 ? 'text-green-700' : p >= 50 ? 'text-amber-700' : 'text-red-700');

/** Wiederkehrende Fehler-Themen (einfache Stichwort-Zuordnung über alle Gespräche) */
const THEMEN: Array<{ key: string; label: string; muster: RegExp }> = [
  { key: 'rahmen', label: 'Kein Rahmen / keine Agenda', muster: /rahmen|agenda|ablauf|führung übernahm|steuerte nicht/i },
  { key: 'schmerz', label: 'Schmerz/Wert nicht beziffert', muster: /schmerz|beziffert|ausgerechnet|kosten des nichthandelns|wert eines/i },
  { key: 'budget', label: 'Preis vor Budget/Entscheider', muster: /budget|entscheider|preis.*(vor|ohne)|kleingeredet|wertverankerung/i },
  { key: 'abschluss', label: 'Keine Entscheidung / kein fester Termin', muster: /kein(en)? (fester|festen) termin|zusage|entscheidungskriterien|hingenommen|vage/i },
  { key: 'einwand', label: 'Einwände nicht verstanden', muster: /einw(a|ä)nd|abgewiegelt|abgebügelt/i },
  { key: 'rede', label: 'Zu hoher Redeanteil / Monolog', muster: /redeanteil|monolog|vortrag/i },
  { key: 'quali', label: 'Qualifizierung lückenhaft', muster: /qualifizierung|nicht erfragt|nicht aktiv ab/i },
];

function Liste({ titel, punkte }: { titel: string; punkte: string[] }) {
  if (!punkte.length) return null;
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">{titel}</p>
      <ul className="mt-1 space-y-0.5 text-[14px] text-gray-800">{punkte.map((p, i) => <li key={i}>• {p}</li>)}</ul>
    </div>
  );
}

function Detail({ g }: { g: Gespraech }) {
  const a = g.ergebnis!;
  const sit = Object.entries({ Team: a.situation.teamgroesse, Ziel: a.situation.ziel, Budget: a.situation.budget, Entscheider: a.situation.entscheider, Zeitrahmen: a.situation.zeitrahmen })
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}: ${v}`);
  return (
    <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
      <p className="text-[14px] leading-relaxed text-gray-800">{a.zusammenfassung}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Liste titel="Situation" punkte={sit} />
        <Liste titel="Einwände" punkte={a.einwaende} />
        <Liste titel="Nächste Schritte" punkte={a.naechste_schritte} />
        <Liste titel="Stärken" punkte={a.staerken} />
      </div>
      {a.fehler.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Fehler & besser</p>
          <ol className="mt-1 space-y-2">
            {a.fehler.map((f, i) => (
              <li key={i} className="rounded-lg bg-red-50/60 p-2.5 text-[14px]">
                <p className="font-medium text-gray-900">{i + 1}. {f.fehler}</p>
                <p className="mt-1 text-gray-700">
                  Gesagt: „{f.zitat}“{' '}
                  <a href={ff(g.fireflies_id, f.sekunden)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-red-700">
                    <PlayCircle className="h-3.5 w-3.5" /> {mmss(f.sekunden)}
                  </a>
                </p>
                <p className="mt-0.5 text-green-800">Besser: {f.besser}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
      {a.tipp_naechstes_gespraech && <p className="rounded-lg bg-amber-50 p-2.5 text-[14px] text-amber-900"><strong>Nächstes Mal:</strong> {a.tipp_naechstes_gespraech}</p>}
    </div>
  );
}

/** Sales-Controlling → Gespräche: alle analysierten Fireflies-/Close-Gespräche, Bewertung und Coaching */
export function GespraecheBereich() {
  const [liste, setListe] = useState<Gespraech[] | null>(null);
  const [art, setArt] = useState('alle');
  const [offen, setOffen] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('g'),
  );

  useEffect(() => {
    let aktiv = true;
    fetch('/api/admin/gespraeche', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { gespraeche: [] }))
      .then((d) => aktiv && setListe(d.gespraeche ?? []))
      .catch(() => aktiv && setListe([]));
    return () => {
      aktiv = false;
    };
  }, []);

  const analysiert = useMemo(() => (liste ?? []).filter((g) => g.ergebnis && g.status !== 'uebersprungen'), [liste]);
  const sichtbar = analysiert.filter((g) => art === 'alle' || g.ergebnis!.art === art);
  const schnitt = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const ØPunkte = schnitt(sichtbar.map((g) => g.ergebnis!.punkte));
  const ØChance = schnitt(sichtbar.filter((g) => VERKAUF.includes(g.ergebnis!.art)).map((g) => g.ergebnis!.abschluss_chance));
  // Prognose vs. Ergebnis: Abschlussquote der Closing-Gespräche mit bekanntem Ausgang
  const closings = analysiert.filter((g) => g.ergebnis!.art === 'closing');
  const gewonnen = closings.filter((g) => g.ausgang === 'gewonnen').length;
  // Gespräche je Phase (für das Sales-Controlling: wo im Prozess wird telefoniert und wie gut)
  const phasen = VERKAUF.map((p) => {
    const xs = analysiert.filter((g) => g.ergebnis!.art === p);
    return { p, n: xs.length, punkte: schnitt(xs.map((g) => g.ergebnis!.punkte)) };
  });
  const themen = THEMEN.map((t) => ({ ...t, n: sichtbar.filter((g) => g.ergebnis!.fehler.some((f) => t.muster.test(f.fehler))).length }))
    .filter((t) => t.n > 0)
    .sort((a, b) => b.n - a.n);

  if (!liste) return <Card><p className="text-[14px] text-gray-500">Lädt Gespräche …</p></Card>;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <h3 className="text-[17px] font-medium">Gesprächsqualität</h3>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div><p className="text-[12.5px] text-gray-500">Gespräche</p><p className="text-[26px] font-semibold">{sichtbar.length}</p></div>
            <div><p className="text-[12.5px] text-gray-500">Ø Gesprächsführung</p><p className={`text-[26px] font-semibold ${farbe(ØPunkte)}`}>{ØPunkte ?? '–'}</p></div>
            <div><p className="text-[12.5px] text-gray-500">Ø Abschlusschance</p><p className="text-[26px] font-semibold">{ØChance === null ? '–' : `${ØChance} %`}</p></div>
          </div>
          {closings.length > 0 && (
            <p className="mt-2 text-[13px] text-gray-600">
              Closing-Gespräche: <strong className="font-semibold text-ink">{gewonnen} von {closings.length} gewonnen</strong> (
              {Math.round((gewonnen / closings.length) * 100)} %) – laut Close.
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {phasen.map((x) => (
              <div key={x.p} className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-[12px] text-gray-500">{ART[x.p]}</p>
                <p className="text-[15px] font-semibold">
                  {x.n} <span className={`text-[13px] font-medium ${farbe(x.punkte)}`}>{x.punkte === null ? '' : `Ø ${x.punkte}`}</span>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 -mx-1 overflow-x-auto px-1">
            <SegmentedControl
              items={[
                { value: 'alle', label: 'Alle' },
                { value: 'opening', label: 'Opening' },
                { value: 'setting', label: 'Setting' },
                { value: 'follow_up', label: 'Follow-up' },
                { value: 'closing', label: 'Closing' },
                { value: 'kunde', label: 'Kunden' },
              ]}
              value={art}
              onChange={setArt}
            />
          </div>
        </Card>
        <Card>
          <h3 className="text-[17px] font-medium">Wiederkehrende Fehler</h3>
          <p className="mt-1 text-[13px] text-gray-600">In wie vielen Gesprächen das Thema vorkommt – Grundlage fürs Coaching.</p>
          <ul className="mt-2 space-y-1.5">
            {themen.length ? themen.map((t) => (
              <li key={t.key} className="flex items-center gap-3 text-[14px]">
                <span className="min-w-0 flex-1">{t.label}</span>
                <span className="h-2 rounded-full bg-red-700" style={{ width: `${Math.max(8, (t.n / Math.max(1, sichtbar.length)) * 120)}px` }} />
                <span className="w-12 text-right text-gray-600">{t.n}/{sichtbar.length}</span>
              </li>
            )) : <li className="text-[14px] text-gray-500">Noch keine Daten.</li>}
          </ul>
        </Card>
      </div>

      <Card padding="none">
        <ul className="divide-y divide-gray-100">
          {sichtbar.length === 0 && <li className="p-5 text-[14px] text-gray-500">Noch keine analysierten Gespräche.</li>}
          {sichtbar.map((g) => {
            const a = g.ergebnis!;
            const auf = offen === g.fireflies_id;
            return (
              <li key={g.fireflies_id} id={g.fireflies_id} className="p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <button onClick={() => setOffen(auf ? null : g.fireflies_id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${auf ? 'rotate-180' : ''}`} />
                    <span className="truncate text-[15px] font-medium">{(g.titel ?? 'Gespräch').split(':')[0]}</span>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[12px] text-gray-600">{ART[a.art] ?? a.art}</span>
                  </button>
                  <span className="text-[13px] text-gray-500">
                    {g.datum ? new Date(g.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''} · {Math.round(g.dauer_min ?? 0)} Min.
                  </span>
                  <span className={`text-[14px] font-semibold ${farbe(a.punkte)}`}>{a.punkte}/100</span>
                  {VERKAUF.includes(a.art) && <span className="text-[13px] text-gray-600">Chance {a.abschluss_chance} %</span>}
                  {g.ausgang === 'gewonnen' && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[12px] font-semibold text-green-800">Gewonnen</span>}
                  {g.ausgang === 'verloren' && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[12px] font-semibold text-gray-700">Verloren</span>}
                  <a href={ff(g.fireflies_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-red-700">
                    <PlayCircle className="h-4 w-4" /> Aufnahme
                  </a>
                  {g.close_lead_id ? (
                    <a href={`https://app.close.com/lead/${g.close_lead_id}/`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-gray-700">
                      <ExternalLink className="h-3.5 w-3.5" /> Close
                    </a>
                  ) : (
                    <span className="text-[12.5px] text-amber-700">kein Lead in Close</span>
                  )}
                </div>
                {!auf && <p className="mt-1 pl-6 text-[13.5px] text-gray-600">{a.zusammenfassung.split(/(?<=[.!?])\s/)[0]}</p>}
                {auf && <Detail g={g} />}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
