'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, UserPlus, Users } from 'lucide-react';
import { Card } from '@/components/ui';
import { AMPEL_LABEL, type Ampel, type Auslastung } from '@/lib/sales-controlling/auslastung';

const zahl = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n.toLocaleString('de-DE', { maximumFractionDigits: 1 }));
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`);
const tagKurz = (t: string) => new Date(t + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }).replace('.,', '');
const wocheKurz = (t: string) => new Date(t + 'T12:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

const AMPEL_FARBE: Record<Ampel, string> = {
  leer: 'text-gray-300',
  nicht_ausgelastet: 'bg-sky-50 text-sky-800',
  okay: 'bg-lime-50 text-lime-800',
  optimal: 'bg-green-100 text-green-800',
  fast_voll: 'bg-amber-100 text-amber-800',
  ueberlastet: 'bg-red-100 text-red-800',
};

function AmpelPunkt({ ampel }: { ampel: Ampel }) {
  if (ampel === 'leer') return <span className="text-gray-400">–</span>;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ${AMPEL_FARBE[ampel]}`}>{AMPEL_LABEL[ampel]}</span>;
}

function Titel({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-[19px] font-medium tracking-[-0.02em]">{children}</h2>
      {sub && <p className="mt-1 text-[13.5px] text-gray-600">{sub}</p>}
    </div>
  );
}

const th = 'pb-2 text-right font-medium';
const thLinks = 'sticky left-0 z-10 bg-card pb-2 pr-3 text-left font-medium';
const tdLinks = 'sticky left-0 z-10 bg-card py-2 pr-3 font-medium whitespace-nowrap';

type Rollenwerte = Auslastung['kapazitaet']['setter'];

function Rolle({ titel, r, einheit, optimum }: { titel: string; r: Rollenwerte; einheit: string; optimum: string }) {
  return (
    <div className={`rounded-[16px] p-4 ${r.neuNoetig ? 'bg-red-50' : 'bg-panel'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] text-gray-600">
          <Users className="h-3.5 w-3.5" />
          {titel} · {r.anzahl} aktiv
        </p>
        <AmpelPunkt ampel={r.ampel} />
      </div>
      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.03em]">
        {zahl(r.schnitt)} <span className="text-[14px] font-normal text-gray-600">{einheit}</span>
      </p>
      <p className="mt-1.5 text-[12.5px] text-gray-600">
        {r.prozent === null ? '–' : `${r.prozent} %`} vom Optimum ({optimum}) · Eingang Ø {zahl(r.volumenProTag)} Termine/Werktag → optimal {zahl(r.optimalAnzahl)} Personen
      </p>
      <p className={`mt-2 flex items-start gap-1.5 text-[13px] ${r.neuNoetig ? 'font-medium text-red-800' : 'text-gray-700'}`}>
        {r.neuNoetig && <UserPlus className="mt-0.5 h-3.5 w-3.5 flex-none" />}
        {r.aussage}
      </p>
    </div>
  );
}

function Kapazitaet({ a }: { a: Auslastung }) {
  const k = a.kapazitaet;
  const maxWoche = Math.max(1, ...k.wochen.map((w) => Math.max(w.settingsGebucht, w.closingsGebucht)));
  return (
    <Card>
      <Titel sub={`Letzte ${k.tage} Werktage – Ø gehaltene Termine pro aktiver Person und Tag.`}>Team-Auslastung</Titel>
      <div className="grid gap-3 lg:grid-cols-2">
        <Rolle titel="Setter" r={k.setter} einheit="Settings/Tag" optimum={`${a.schwellen.settingOptimal}, max. ${a.schwellen.settingKapazitaet} theoretisch`} />
        <Rolle titel="Closer" r={k.closer} einheit="Closings/Tag" optimum={`${a.schwellen.closingMin}–${a.schwellen.closingOptimal}`} />
      </div>
      <p className="mb-2 mt-5 text-[13px] font-medium text-gray-700">Termin-Eingänge je Woche (gebucht)</p>
      <div className="flex h-[140px] items-end gap-2">
        {k.wochen.map((w) => (
          <div key={w.woche} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${w.settingsGebucht} Settings · ${w.closingsGebucht} Closings gebucht`}>
            <div className="flex h-full w-full items-end justify-center gap-0.5">
              <div className="w-1/2 max-w-[16px] rounded-t-[5px] bg-gradient-to-b from-red-700 to-red-950" style={{ height: `${Math.max(2, (w.settingsGebucht / maxWoche) * 100)}%` }} />
              <div className="w-1/2 max-w-[16px] rounded-t-[5px] bg-red-200" style={{ height: `${Math.max(2, (w.closingsGebucht / maxWoche) * 100)}%` }} />
            </div>
            <span className="text-[11px] text-gray-500">{wocheKurz(w.woche)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 flex gap-4 text-[12px] text-gray-600">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-800" />Settings</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-200" />Closings (inkl. CC2)</span>
      </p>
    </Card>
  );
}

function SetterTabelle({ a }: { a: Auslastung }) {
  return (
    <Card>
      <Titel
        sub={`Gehaltene Settings und Setting-Follow-up-Anwahlen je Tag. Ampel: < ${a.schwellen.settingMin} nicht ausgelastet · ${a.schwellen.settingOptimal} optimal · ab ${a.schwellen.settingVoll} fast voll · > ${a.schwellen.settingMax} überlastet. Follow-ups rot unter ${a.schwellen.followupsMin}/Tag.`}
      >
        Setter je Tag
      </Titel>
      {a.setter.length === 0 ? (
        <p className="text-[13.5px] text-gray-500">Keine Settings oder Setting-Follow-ups im Zeitraum.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead>
              <tr className="border-b border-hair text-xs uppercase tracking-[0.06em] text-gray-500">
                <th className={thLinks}>Person</th>
                {a.tage.map((t) => <th key={t} className={`${th} px-1.5 whitespace-nowrap`}>{tagKurz(t)}</th>)}
                <th className={`${th} pl-3`}>Ø</th>
                <th className={`${th} pl-3`}>Ampel</th>
              </tr>
            </thead>
            <tbody>
              {a.setter.map((s) => (
                <tr key={s.name} className="border-b border-hair align-top last:border-0">
                  <td className={tdLinks}>
                    {s.name}
                    <div className="text-[11.5px] font-normal text-gray-500">Settings · Follow-ups</div>
                  </td>
                  {a.tage.map((t, i) => (
                    <td key={t} className="px-1.5 py-2 text-right">
                      <span className={`inline-block min-w-[26px] rounded-[6px] px-1 text-center font-medium ${s.settingsAmpel[i] === 'leer' ? 'text-gray-300' : AMPEL_FARBE[s.settingsAmpel[i]]}`}>{s.settings[i] || (s.settingsAmpel[i] === 'leer' ? '·' : 0)}</span>
                      <div className={`text-[11.5px] ${s.followupsUnterMin[i] ? 'font-medium text-red-700' : 'text-gray-500'}`}>{s.followups[i] || ''}</div>
                    </td>
                  ))}
                  <td className="py-2 pl-3 text-right">
                    <span className="font-semibold">{zahl(s.schnittSettings)}</span>
                    <div className={`text-[11.5px] ${s.schnittFollowups !== null && s.schnittFollowups < a.schwellen.followupsMin ? 'font-medium text-red-700' : 'text-gray-500'}`}>{zahl(s.schnittFollowups)} FU</div>
                  </td>
                  <td className="py-2 pl-3 text-right">
                    <AmpelPunkt ampel={s.ampel} />
                    <div className="text-[11.5px] text-gray-500">{s.auslastungProzent === null ? '' : `${s.auslastungProzent} %`}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function CloserTabelle({ a }: { a: Auslastung }) {
  return (
    <Card>
      <Titel sub={`Gehaltene Closings inkl. CC2 je Tag. Ziel ${a.schwellen.closingMin}–${a.schwellen.closingOptimal} pro Tag, ab ${a.schwellen.closingUeberlastet} überlastet.`}>Closer je Tag</Titel>
      {a.closer.length === 0 ? (
        <p className="text-[13.5px] text-gray-500">Keine gehaltenen Closings im Zeitraum.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead>
              <tr className="border-b border-hair text-xs uppercase tracking-[0.06em] text-gray-500">
                <th className={thLinks}>Person</th>
                {a.tage.map((t) => <th key={t} className={`${th} px-1.5 whitespace-nowrap`}>{tagKurz(t)}</th>)}
                <th className={`${th} pl-3`}>Summe</th>
                <th className={`${th} pl-3`}>Ø</th>
                <th className={`${th} pl-3`}>Ampel</th>
              </tr>
            </thead>
            <tbody>
              {a.closer.map((c) => (
                <tr key={c.name} className="border-b border-hair last:border-0">
                  <td className={tdLinks}>{c.name}</td>
                  {a.tage.map((t, i) => (
                    <td key={t} className="px-1.5 py-2 text-right">
                      <span className={`inline-block min-w-[26px] rounded-[6px] px-1 text-center font-medium ${c.closingsAmpel[i] === 'leer' ? 'text-gray-300' : AMPEL_FARBE[c.closingsAmpel[i]]}`}>{c.closings[i] || (c.closingsAmpel[i] === 'leer' ? '·' : 0)}</span>
                    </td>
                  ))}
                  <td className="py-2 pl-3 text-right">{c.summeClosings}</td>
                  <td className="py-2 pl-3 text-right font-semibold">{zahl(c.schnittClosings)}</td>
                  <td className="py-2 pl-3 text-right"><AmpelPunkt ampel={c.ampel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AnwahlenTabelle({ a }: { a: Auslastung }) {
  return (
    <Card>
      <Titel sub="Ausgehende Anrufe aus Close je Person und Werktag – oben Anwahlen, darunter Gespräche (angenommen, ≥ 30 s). Kein Ziel (Inbound).">Anwahlen je Person und Tag</Titel>
      {a.anwahlenTabelle.length === 0 ? (
        <p className="text-[13.5px] text-gray-500">Keine Anwahlen im Zeitraum.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead>
              <tr className="border-b border-hair text-xs uppercase tracking-[0.06em] text-gray-500">
                <th className={thLinks}>Person</th>
                {a.tage.map((t) => <th key={t} className={`${th} px-1.5 whitespace-nowrap`}>{tagKurz(t)}</th>)}
                <th className={`${th} pl-3`}>Summe</th>
                <th className={`${th} pl-3`}>Ø/Werktag</th>
              </tr>
            </thead>
            <tbody>
              {a.anwahlenTabelle.map((p) => (
                <tr key={p.name} className="border-b border-hair last:border-0">
                  <td className={tdLinks}>{p.name}</td>
                  {a.tage.map((t, i) => (
                    <td key={t} className="px-1.5 py-2 text-right">
                      <span className={p.anwahlen[i] ? 'font-medium' : 'text-gray-300'}>{p.anwahlen[i] || '·'}</span>
                      <div className="text-[11.5px] text-gray-500">{p.gespraeche[i] || ''}</div>
                    </td>
                  ))}
                  <td className="py-2 pl-3 text-right">
                    <span className="font-semibold">{p.summeAnwahlen}</span>
                    <div className="text-[11.5px] text-gray-500">{p.summeGespraeche} Gespr.</div>
                  </td>
                  <td className="py-2 pl-3 text-right">{zahl(p.schnittAnwahlen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {a.tageGekuerzt && <p className="mt-2 text-[12px] text-gray-500">Gezeigt werden die letzten {a.tage.length} Werktage, Summen und Ø gelten für den ganzen Zeitraum.</p>}
    </Card>
  );
}

function Rueckholung({ a }: { a: Auslastung }) {
  const [offen, setOffen] = useState<string | null>(null);
  return (
    <Card>
      <Titel sub="Wer hat No-Shows wieder in einen Termin (Setting, Closing, CC2) gebracht? Quote = zurückgeholt ÷ selbst gesetzte No-Shows.">No-Show-Rückholung je Person</Titel>
      {a.rueckholung.length === 0 ? (
        <p className="text-[13.5px] text-gray-500">Keine No-Shows im Zeitraum.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13.5px]">
            <thead>
              <tr className="border-b border-hair text-xs uppercase tracking-[0.06em] text-gray-500">
                <th className="pb-2 text-left font-medium">Person</th>
                <th className={th}>No-Shows gesetzt</th>
                <th className={th}>Zurückgeholt</th>
                <th className={th}>davon Setting</th>
                <th className={th}>davon Closing</th>
                <th className={th}>Quote</th>
              </tr>
            </thead>
            <tbody>
              {a.rueckholung.map((r) => (
                <Fragment key={r.name}>
                  <tr className="cursor-pointer border-b border-hair hover:bg-panel" onClick={() => setOffen(offen === r.name ? null : r.name)}>
                    <td className="py-2 font-medium">
                      <span className="inline-flex items-center gap-1">
                        {r.leads.length > 0 ? offen === r.name ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
                        {r.name}
                      </span>
                    </td>
                    <td className="py-2 text-right">{r.noShows}</td>
                    <td className="py-2 text-right font-semibold">{r.rueckgeholt}</td>
                    <td className="py-2 text-right">{r.setting}</td>
                    <td className="py-2 text-right">{r.closing}</td>
                    <td className="py-2 text-right">{pct(r.quote)}</td>
                  </tr>
                  {offen === r.name && r.leads.length > 0 && (
                    <tr className="border-b border-hair bg-panel">
                      <td colSpan={6} className="px-4 py-2">
                        <ul className="space-y-1 text-[13px]">
                          {r.leads.map((l, i) => (
                            <li key={i} className="flex flex-wrap gap-x-2">
                              <span className="font-medium">{l.lead}</span>
                              <span className="text-gray-500">{l.von === 'setting_noshow' ? 'Setting-No-Show' : 'Closing-No-Show'} → {l.nach === 'setting' ? 'Setting' : l.nach === 'cc2' ? 'CC2' : 'Closing'}</span>
                              <span className="text-gray-500">{new Date(l.datum + 'T12:00:00Z').toLocaleDateString('de-DE', { timeZone: 'UTC' })}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function FollowupsJePerson({ a }: { a: Auslastung }) {
  return (
    <Card>
      <Titel
        sub={`Follow-up-Anwahlen = Anrufe bei Leads im Status Setting-Follow-up/No-Show. Vorwärts = aus einem Follow-up weiter zu Setting, Closing, Angebot oder Abschluss.${a.erledigteAufgabenGeladen ? '' : ' Erledigte Aufgaben konnten nicht geladen werden.'}`}
      >
        Follow-ups je Person
      </Titel>
      {a.followups.length === 0 ? (
        <p className="text-[13.5px] text-gray-500">Keine Follow-ups im Zeitraum.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead>
              <tr className="border-b border-hair text-xs uppercase tracking-[0.06em] text-gray-500">
                <th className="pb-2 text-left font-medium">Person</th>
                <th className={th}>FU-Anwahlen</th>
                <th className={th}>pro Werktag</th>
                <th className={th}>Vorwärts</th>
                <th className={th}>Verloren</th>
                <th className={th}>Quote</th>
                <th className={th}>Aufgaben erledigt</th>
                <th className={th}>offen / überfällig</th>
              </tr>
            </thead>
            <tbody>
              {a.followups.map((f) => (
                <tr key={f.name} className="border-b border-hair last:border-0">
                  <td className="py-2 font-medium">{f.name}</td>
                  <td className="py-2 text-right font-semibold">{f.anwahlen}</td>
                  <td className={`py-2 text-right ${f.anwahlen > 0 && f.anwahlenProWerktag < a.schwellen.followupsMin ? 'text-red-700' : ''}`}>{zahl(f.anwahlenProWerktag)}</td>
                  <td className="py-2 text-right">{f.vorwaerts}</td>
                  <td className="py-2 text-right">{f.verloren}</td>
                  <td className="py-2 text-right">{pct(f.quote)}</td>
                  <td className="py-2 text-right">{f.aufgabenErledigt === null ? '–' : f.aufgabenErledigt}</td>
                  <td className="py-2 text-right">
                    {f.aufgabenOffen}
                    {f.aufgabenUeberfaellig > 0 && <span className="text-red-700"> / {f.aufgabenUeberfaellig}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function AuslastungBereich({ a }: { a: Auslastung }) {
  return (
    <div className="space-y-4">
      <Kapazitaet a={a} />
      <SetterTabelle a={a} />
      <CloserTabelle a={a} />
      <AnwahlenTabelle a={a} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Rueckholung a={a} />
        <FollowupsJePerson a={a} />
      </div>
    </div>
  );
}
