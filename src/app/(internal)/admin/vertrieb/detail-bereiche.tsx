'use client';

import { AlertTriangle, Clock, Phone, PhoneCall, PhoneMissed, Repeat, Timer, Voicemail } from 'lucide-react';
import { Card } from '@/components/ui';
import type { SalesDetails } from '@/lib/sales-controlling/detail';

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`);
const zahl = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n.toLocaleString('de-DE', { maximumFractionDigits: 1 }));
const eur = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`;
const minuten = (m: number | null) => (m === null ? '–' : m < 90 ? `${Math.round(m)} Min.` : m < 60 * 48 ? `${zahl(Math.round((m / 60) * 10) / 10)} Std.` : `${zahl(Math.round(m / 60 / 24))} Tage`);
const farbe = (q: number | null, gut: number, ok: number) => (q === null ? 'text-gray-400' : q >= gut ? 'text-green-700' : q >= ok ? 'text-amber-700' : 'text-red-700');

function Kachel({ label, wert, sub, icon, warn }: { label: string; wert: string; sub?: React.ReactNode; icon?: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`rounded-[16px] p-4 ${warn ? 'bg-red-50' : 'bg-panel'}`}>
      <p className="flex items-center gap-1.5 text-[13px] text-gray-600 [&_svg]:h-3.5 [&_svg]:w-3.5">
        {icon}
        {label}
      </p>
      <p className={`mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.03em] ${warn ? 'text-red-800' : ''}`}>{wert}</p>
      {sub && <p className="mt-1.5 text-[12.5px] text-gray-600">{sub}</p>}
    </div>
  );
}

function Titel({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[19px] font-medium tracking-[-0.02em]">{children}</h2>
      {sub && <p className="mt-1 text-[13.5px] text-gray-600">{sub}</p>}
    </div>
  );
}

/** Balken mit Quote, Höhe = Anwahlen */
function Balken({ items, max }: { items: Array<{ label: string; anwahlen: number; gespraeche: number; quote: number | null; hervor?: boolean }>; max: number }) {
  return (
    <div className="flex h-[170px] items-end gap-1.5">
      {items.map((s, i) => (
        <div key={s.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${s.anwahlen} Anwahlen · ${s.gespraeche} Gespräche`}>
          <span className={`text-[10.5px] font-semibold ${farbe(s.quote, 40, 25)}`}>{s.quote === null ? '' : `${Math.round(s.quote)}%`}</span>
          <div className="relative w-full max-w-[34px] overflow-hidden rounded-[8px] bg-red-100" style={{ height: `${Math.max(4, (s.anwahlen / max) * 100)}%`, animation: `fx-grow .8s cubic-bezier(.33,1,.68,1) ${i * 30}ms both` }}>
            <div className={`absolute inset-x-0 bottom-0 ${s.hervor ? 'bg-green-600' : 'bg-gradient-to-b from-red-700 to-red-950'}`} style={{ height: `${s.anwahlen ? (s.gespraeche / s.anwahlen) * 100 : 0}%` }} />
          </div>
          <span className="text-[11px] text-gray-500">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Telefonie ─────────────────────────────────────────────────── */

export function TelefonieBereich({ t, verbunden, label }: { t: SalesDetails['telefonie']; verbunden: boolean; label: string }) {
  const maxStunde = Math.max(1, ...t.stunden.map((s) => s.anwahlen));
  const maxTag = Math.max(1, ...t.wochentage.map((s) => s.anwahlen));
  return (
    <div className="space-y-4">
      <Card>
        <Titel sub={`${label} · ausgehende Anrufe aus Close. Gespräch = angenommen und mindestens 30 Sekunden.`}>Anwahlen & Erreichbarkeit</Titel>
        {!verbunden && <p className="mb-3 text-[13px] text-amber-700">Anrufe konnten gerade nicht aus Close geladen werden.</p>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kachel icon={<PhoneCall />} label="Anwahlen" wert={zahl(t.anwahlen)} sub={`${zahl(t.anwahlenProWerktag)} pro Werktag · ${t.leadsAngerufen} Leads`} />
          <Kachel icon={<Phone />} label="Gespräche" wert={zahl(t.gespraeche)} sub={`${zahl(t.gespraecheProWerktag)} pro Werktag`} />
          <Kachel label="Erreichbarkeit" wert={pct(t.erreichbarkeit)} sub="Gespräche ÷ Anwahlen" warn={t.erreichbarkeit !== null && t.anwahlen >= 20 && t.erreichbarkeit < 20} />
          <Kachel icon={<Clock />} label="Gesprächszeit" wert={t.gespraechsMinuten >= 120 ? `${zahl(Math.round(t.gespraechsMinuten / 6) / 10)} Std.` : `${t.gespraechsMinuten} Min.`} sub={`Ø ${zahl(t.schnittGespraechMin)} Min. pro Gespräch`} />
          <Kachel icon={<PhoneMissed />} label="Nicht erreicht" wert={zahl(t.nichtErreicht)} sub={`${t.kurzgespraeche} Kurzgespräche (< 30 s)`} />
          <Kachel icon={<Voicemail />} label="Mailbox" wert={zahl(t.mailbox)} />
          <Kachel icon={<Repeat />} label="Anwahlen bis Gespräch" wert={zahl(t.anwahlenBisGespraech)} sub="Ø Versuche bis zum ersten Gespräch" />
          <Kachel
            icon={<Timer />}
            label="Speed-to-Lead"
            wert={minuten(t.speedToLeadMedianMin)}
            sub={t.neueDealsOhneAnwahl ? <span className="font-medium text-red-700">{t.neueDealsOhneAnwahl} von {t.neueDeals} neuen Deals nie angerufen</span> : 'Median bis zur ersten Anwahl'}
            warn={t.neueDealsOhneAnwahl > 0}
          />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <Titel sub="Höhe = Anwahlen, dunkler Teil = Gespräche, Zahl = Erreichbarkeit. Grün = beste Zeiten.">Beste Anrufzeiten</Titel>
          <Balken
            max={maxStunde}
            items={t.stunden.map((s) => ({ label: `${s.stunde}`, anwahlen: s.anwahlen, gespraeche: s.gespraeche, quote: s.quote, hervor: t.besteStunden.includes(s.stunde) }))}
          />
          {t.besteStunden.length > 0 && (
            <p className="mt-3 text-[13px] text-gray-700">
              Am besten erreichbar: <strong>{[...t.besteStunden].sort((a, b) => a - b).map((h) => `${h}–${h + 1} Uhr`).join(', ')}</strong>
            </p>
          )}
        </Card>
        <Card>
          <Titel sub="Erreichbarkeit nach Wochentag">Wochentage</Titel>
          <Balken max={maxTag} items={t.wochentage.map((w) => ({ label: w.tag, anwahlen: w.anwahlen, gespraeche: w.gespraeche, quote: w.quote }))} />
        </Card>
      </div>

      <Card>
        <Titel>Telefonie je Person</Titel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[14px]">
            <thead>
              <tr className="border-b border-hair text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                <th className="pb-2">Person</th>
                <th className="pb-2 text-right">Anwahlen</th>
                <th className="pb-2 text-right">pro Werktag</th>
                <th className="pb-2 text-right">Leads</th>
                <th className="pb-2 text-right">Gespräche</th>
                <th className="pb-2 text-right">Erreichbarkeit</th>
                <th className="pb-2 text-right">Gesprächszeit</th>
              </tr>
            </thead>
            <tbody>
              {t.personen.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-3 text-gray-500">
                    Keine Anrufe im Zeitraum.
                  </td>
                </tr>
              )}
              {t.personen.map((p) => (
                <tr key={p.name} className="border-b border-hair last:border-0">
                  <td className="py-2.5 font-medium">{p.name}</td>
                  <td className="py-2.5 text-right font-semibold">{p.anwahlen}</td>
                  <td className="py-2.5 text-right">{zahl(p.proWerktag)}</td>
                  <td className="py-2.5 text-right">{p.leads}</td>
                  <td className="py-2.5 text-right">{p.gespraeche}</td>
                  <td className={`py-2.5 text-right font-medium ${farbe(p.erreichbarkeit, 40, 25)}`}>{pct(p.erreichbarkeit)}</td>
                  <td className="py-2.5 text-right">{p.minuten} Min.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── Show-Quoten im Detail ─────────────────────────────────────── */

function ShowKarte({ titel, d, ziel }: { titel: string; d: { gebucht: number; gehalten: number; noShow: number; quote: number | null }; ziel: number }) {
  return (
    <div className="rounded-[16px] bg-panel p-4">
      <p className="text-[13px] font-medium text-gray-600">{titel}</p>
      <p className={`mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.03em] ${farbe(d.quote, ziel, ziel - 15)}`}>{pct(d.quote)}</p>
      <p className="mt-1 text-[12px] text-gray-500">Show-Quote · Ziel {ziel} %</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[12px]">
        {[
          ['Terminiert', d.gebucht],
          ['Erschienen', d.gehalten],
          ['No-Show', d.noShow],
        ].map(([l, n]) => (
          <div key={l as string} className="rounded-[10px] bg-card py-1.5">
            <dd className="text-[16px] font-semibold">{n}</dd>
            <dt className="text-gray-500">{l}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ShowDetail({ s, durchlauf }: { s: SalesDetails['shows']; durchlauf: SalesDetails['durchlauf'] }) {
  const max = Math.max(1, ...s.wochen.map((w) => Math.max(w.settingsGebucht, w.closingsGebucht)));
  return (
    <div className="space-y-4">
      <Card>
        <Titel sub="Erschienen = Termin wurde danach weiterbearbeitet (Follow-up, nächste Stufe, Angebot, gewonnen oder verloren).">Show-Quoten im Detail</Titel>
        <div className="grid gap-3 md:grid-cols-3">
          <ShowKarte titel="Setting" d={s.setting} ziel={70} />
          <ShowKarte titel="Closing" d={s.closing} ziel={80} />
          <ShowKarte titel="CC2 (Zweitgespräch)" d={s.cc2} ziel={85} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {[
            { l: 'Setting-No-Shows zurückgeholt', r: s.rückholungSetting },
            { l: 'Closing-No-Shows zurückgeholt', r: s.rückholungClosing },
          ].map(({ l, r }) => (
            <div key={l} className="flex items-center justify-between rounded-[16px] bg-panel p-4">
              <div>
                <p className="text-[13px] text-gray-600">{l}</p>
                <p className="mt-1 text-[12.5px] text-gray-500">
                  {r.wiederTerminiert} von {r.noShows} No-Shows wieder terminiert bzw. doch gehalten
                </p>
              </div>
              <p className={`text-[24px] font-semibold tracking-[-0.03em] ${farbe(r.quote, 50, 30)}`}>{pct(r.quote)}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <Titel sub="Terminierte Settings und Closings je Woche, darunter die Show-Quoten.">Wochentrend (8 Wochen)</Titel>
          <div className="overflow-x-auto">
            <div className="grid min-w-[520px] grid-cols-8 gap-2">
              {s.wochen.map((w, i) => (
                <div key={w.woche} className="flex flex-col items-center">
                  <div className="flex h-[120px] w-full items-end justify-center gap-1">
                    <div className="w-3 rounded-t-[4px] bg-red-300" style={{ height: `${Math.max(3, (w.settingsGebucht / max) * 100)}%`, animation: `fx-grow .8s ease ${i * 40}ms both` }} title={`${w.settingsGebucht} Settings`} />
                    <div className="w-3 rounded-t-[4px] bg-red-800" style={{ height: `${Math.max(3, (w.closingsGebucht / max) * 100)}%`, animation: `fx-grow .8s ease ${i * 40}ms both` }} title={`${w.closingsGebucht} Closings`} />
                  </div>
                  <span className="mt-1 text-[11px] text-gray-500">{new Date(w.woche + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
                  <span className={`text-[11px] font-medium ${farbe(w.settingQuote, 70, 55)}`}>S {w.settingQuote === null ? '–' : `${Math.round(w.settingQuote)}%`}</span>
                  <span className={`text-[11px] font-medium ${farbe(w.closingQuote, 80, 65)}`}>C {w.closingQuote === null ? '–' : `${Math.round(w.closingQuote)}%`}</span>
                  <span className="text-[10.5px] text-gray-400">{w.anwahlen} Anw.</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[12px] text-gray-500">
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-300" /> Settings terminiert ·{' '}
            <span className="mx-1 inline-block h-2 w-2 rounded-sm bg-red-800" /> Closings terminiert · S/C = Show-Quote
          </p>
        </Card>
        <Card>
          <Titel sub="Median der Tage bis zur nächsten Stufe (Abschlüsse im Zeitraum)">Durchlaufzeiten</Titel>
          <ul className="space-y-3">
            {[
              { l: 'Anfrage → Setting terminiert', d: durchlauf.anfrageSetting },
              { l: 'Setting → Closing terminiert', d: durchlauf.settingClosing },
              { l: 'Closing → Abschluss', d: durchlauf.closingAbschluss },
            ].map((x) => (
              <li key={x.l} className="flex items-center justify-between rounded-[14px] bg-panel px-4 py-3">
                <span className="text-[14px]">{x.l}</span>
                <span className="text-right">
                  <strong className="text-[18px] font-semibold">{x.d.tage === null ? '–' : `${zahl(x.d.tage)} T.`}</strong>
                  <span className="block text-[11.5px] text-gray-500">{x.d.faelle} Fälle</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {s.personen.length > 0 && (
        <Card>
          <Titel sub="Wer den Status in Close gesetzt hat">Show-Quoten je Person</Titel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead>
                <tr className="border-b border-hair text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                  <th className="pb-2">Person</th>
                  <th className="pb-2 text-right">Settings</th>
                  <th className="pb-2 text-right">No-Shows</th>
                  <th className="pb-2 text-right">Setting-Show</th>
                  <th className="pb-2 text-right">Closings</th>
                  <th className="pb-2 text-right">No-Shows</th>
                  <th className="pb-2 text-right">Closing-Show</th>
                </tr>
              </thead>
              <tbody>
                {s.personen.map((p) => (
                  <tr key={p.name} className="border-b border-hair last:border-0">
                    <td className="py-2.5 font-medium">{p.name}</td>
                    <td className="py-2.5 text-right">{p.setting.gebucht}</td>
                    <td className="py-2.5 text-right">{p.setting.noShow}</td>
                    <td className={`py-2.5 text-right font-medium ${farbe(p.setting.quote, 70, 55)}`}>{pct(p.setting.quote)}</td>
                    <td className="py-2.5 text-right">{p.closing.gebucht}</td>
                    <td className="py-2.5 text-right">{p.closing.noShow}</td>
                    <td className={`py-2.5 text-right font-medium ${farbe(p.closing.quote, 80, 65)}`}>{pct(p.closing.quote)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── Follow-ups ────────────────────────────────────────────────── */

export function FollowupBereich({ f, verbunden }: { f: SalesDetails['followups']; verbunden: boolean }) {
  const a = f.aufgaben;
  return (
    <div className="space-y-4">
      <Card>
        <Titel sub="Offene Aufgaben in Close zu Leads und Deals">Follow-up-Aufgaben</Titel>
        {!verbunden && <p className="mb-3 text-[13px] text-amber-700">Aufgaben konnten gerade nicht aus Close geladen werden.</p>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kachel label="Überfällig" wert={zahl(a.ueberfaellig)} warn={a.ueberfaellig > 0} icon={<AlertTriangle />} />
          <Kachel label="Heute fällig" wert={zahl(a.heute)} />
          <Kachel label="Nächste 7 Tage" wert={zahl(a.naechste7)} />
          <Kachel label="Offen gesamt" wert={zahl(a.offen)} />
          <Kachel label="Deals ohne nächsten Schritt" wert={zahl(a.dealsOhneAufgabe)} sub={`von ${f.offenGesamt} offenen Deals`} warn={a.dealsOhneAufgabe > 0} />
        </div>
        {a.ueberfaelligListe.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead>
                <tr className="border-b border-hair text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                  <th className="pb-2">Lead</th>
                  <th className="pb-2">Aufgabe</th>
                  <th className="pb-2">Zuständig</th>
                  <th className="pb-2 text-right">Fällig</th>
                </tr>
              </thead>
              <tbody>
                {a.ueberfaelligListe.map((x, i) => (
                  <tr key={i} className="border-b border-hair last:border-0">
                    <td className="py-2 font-medium">{x.lead}</td>
                    <td className="max-w-[320px] truncate py-2 text-gray-700">{x.text || '–'}</td>
                    <td className="py-2">{x.person}</td>
                    <td className="py-2 text-right font-medium text-red-700">seit {x.tageUeber} {x.tageUeber === 1 ? 'Tag' : 'Tagen'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <Titel sub="Deals, die gerade nachgefasst werden müssen – wie viele, wie viel Wert und wie lange schon">Follow-up-Bestand</Titel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[14px]">
              <thead>
                <tr className="border-b border-hair text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                  <th className="pb-2">Stufe</th>
                  <th className="pb-2 text-right">Deals</th>
                  <th className="pb-2 text-right">Wert</th>
                  <th className="pb-2 text-right">Ø Tage dort</th>
                  <th className="pb-2 text-right">&gt; 14 T.</th>
                  <th className="pb-2 text-right">&gt; 30 T.</th>
                </tr>
              </thead>
              <tbody>
                {f.bestand.map((b) => (
                  <tr key={b.stufe} className={`border-b border-hair last:border-0 ${b.anzahl === 0 ? 'text-gray-400' : ''}`}>
                    <td className="py-2.5">{b.label}</td>
                    <td className="py-2.5 text-right font-semibold">{b.anzahl}</td>
                    <td className="py-2.5 text-right">{eur(b.wert)}</td>
                    <td className="py-2.5 text-right">{b.schnittTage ?? '–'}</td>
                    <td className={`py-2.5 text-right ${b.aelter14 ? 'font-semibold text-amber-700' : ''}`}>{b.aelter14 || '–'}</td>
                    <td className={`py-2.5 text-right ${b.aelter30 ? 'font-semibold text-red-700' : ''}`}>{b.aelter30 || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <Titel sub="Was im Zeitraum aus Setting-/Closing-Follow-ups wurde">Follow-up-Ausgang</Titel>
          <p className={`text-[40px] font-semibold leading-none tracking-[-0.04em] ${farbe(f.ausgang.quote, 40, 20)}`}>{pct(f.ausgang.quote)}</p>
          <p className="mt-1 text-[13px] text-gray-600">kamen weiter (Closing, CC2, Angebot oder Abschluss)</p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ['Bewegt', f.ausgang.gesamt],
              ['Weiter', f.ausgang.vorwärts],
              ['Verloren', f.ausgang.verloren],
            ].map(([l, n]) => (
              <div key={l as string} className="rounded-[12px] bg-panel py-2">
                <dd className="text-[20px] font-semibold">{n}</dd>
                <dt className="text-[12px] text-gray-500">{l}</dt>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}
