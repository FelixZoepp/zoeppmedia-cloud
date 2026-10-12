'use client';

import { useEffect, useState } from 'react';
import { PhoneCall, Mail, MessageCircle, Scale, RefreshCw, StickyNote, LifeBuoy, Compass, History } from 'lucide-react';
import { Card } from '@/components/ui/card';

/**
 * Mahnwesen: nichts geht automatisch raus. Die Cloud schlägt den fälligen Schritt vor (auch als Aufgabe),
 * die Buchhaltung prüft Text und Empfänger und verschickt selbst. Alles landet im Verlauf.
 */

export interface VerlaufEintrag {
  id: string; schritt: number; ergebnis: string; kanal: string | null; notiz: string | null;
  details: Record<string, unknown> | null; zugesagt_bis: string | null; created_at: string; von: string | null;
}
export interface Entscheidung { id: string; titel: string; empfehlung: string | null; status: string; notiz: string | null; entschieden_am: string | null; created_at: string }
export interface Fall {
  id: string; kunde: string | null; kontakt_name: string | null; rechnungsnummer: string | null; betrag_offen: number | null;
  rechnungsdatum: string; zahlungsziel: string; typ: string; schritt: number; status: string; zugesagt_bis: string | null;
  einschaetzung: 'zahlt' | 'unsicher' | 'ausfall' | null;
  telefon: string | null; kunden_mail: string | null;
  faellig: { schritt: number; titel: string; telefon: string | null; mail: { an: string | null; betreff: string; text: string } | null; whatsapp: string | null } | null;
  naechster: { titel: string; datum: string } | null;
  verlauf: VerlaufEintrag[];
  entscheidungen: Entscheidung[];
}
interface Summe { anzahl: number; summe: number }
export interface MahnBericht {
  offen: Summe; ueberfaellig: Summe; anwalt: Summe; zugesagt: Summe; bezahlt30: Summe;
  nachSchritt: Array<{ schritt: number; titel: string; anzahl: number; summe: number }>;
  einschaetzung: { zahlt: number; unsicher: number; ausfall: number };
  ausfallRisiko: number;
  schuldner: Array<{ kunde: string; summe: number; aeltesteTage: number; schritt: number; einschaetzung: string | null }>;
}
export interface MahnDaten { ab: string | null; bericht: MahnBericht; faelle: Fall[] }

const euro = (n: number | null) => (n == null ? '–' : `${Number(n).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`);
const datum = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '–');
const zeit = (d: string) => new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const inputCls = 'h-9 rounded-lg border border-gray-300 bg-white px-2.5 text-sm';
const areaCls = 'w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm';
const tageSeit = (d: string) => Math.max(0, Math.round((Date.now() - new Date(`${d}T12:00:00`).getTime()) / 864e5));

const EINSCHAETZUNG: Record<string, { label: string; cls: string }> = {
  zahlt: { label: '🟢 zahlt', cls: 'bg-green-50 text-green-700' },
  unsicher: { label: '🟡 unsicher', cls: 'bg-yellow-50 text-yellow-800' },
  ausfall: { label: '🔴 Ausfall droht', cls: 'bg-red-50 text-red-700' },
};

const VERLAUF_ICON: Record<string, string> = {
  anruf: '📞', mail: '✉️', whatsapp: '💬', notiz: '📝', krisengespraech: '🆘', eskalation: '🧭', entscheidung: '⚖️', status: '🔁',
};

function waLink(telefon: string | null, text: string): string | null {
  if (!telefon) return null;
  let n = telefon.replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = `+${n.slice(2)}`;
  else if (n.startsWith('0')) n = `+49${n.slice(1)}`;
  n = n.replace('+', '');
  return n.length >= 8 ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

function Verlauf({ f }: { f: Fall }) {
  if (!f.verlauf.length) return <p className="text-xs text-gray-400">Noch keine Einträge.</p>;
  return (
    <ul className="space-y-2">
      {f.verlauf.map((v) => {
        const d = v.details ?? {};
        return (
          <li key={v.id} className="text-sm">
            <div className="flex flex-wrap gap-x-2 text-xs text-gray-500">
              <span>{VERLAUF_ICON[v.kanal ?? ''] ?? '•'} {zeit(v.created_at)}</span>
              {v.von && <span>· {v.von}</span>}
              {v.schritt > 0 && <span>· Schritt {v.schritt}</span>}
              {v.ergebnis === 'erreicht' && <span className="text-green-700">· erreicht</span>}
              {v.ergebnis === 'nicht_erreicht' && <span className="text-orange-700">· nicht erreicht</span>}
            </div>
            {v.notiz && <p className="text-gray-800 whitespace-pre-line">{v.notiz}</p>}
            {v.kanal === 'krisengespraech' && (
              <div className="mt-1 rounded-lg bg-gray-50 p-2 text-xs text-gray-700 space-y-0.5">
                {typeof d.grund === 'string' && <p><b>Grund:</b> {d.grund}</p>}
                {typeof d.vereinbarung === 'string' && <p><b>Vereinbarung:</b> {d.vereinbarung}{typeof d.raten === 'string' ? ` · ${d.raten}` : ''}{typeof d.betrag === 'string' ? ` · ${d.betrag}` : ''}</p>}
                {typeof d.naechster_kontakt === 'string' && <p><b>Nächster Kontakt:</b> {datum(d.naechster_kontakt)}</p>}
                {typeof d.einschaetzung === 'string' && <p><b>Einschätzung:</b> {EINSCHAETZUNG[d.einschaetzung]?.label}</p>}
              </div>
            )}
            {v.zugesagt_bis && <p className="text-xs text-green-700">Zahlung zugesagt bis {datum(v.zugesagt_bis)}</p>}
          </li>
        );
      })}
    </ul>
  );
}

type Panel = null | 'notiz' | 'krise' | 'felix' | 'verlauf';

function FallCard({ f, hervorheben, post }: { f: Fall; hervorheben: boolean; post: (b: Record<string, unknown>) => Promise<boolean> }) {
  const s = f.faellig;
  const [zusage, setZusage] = useState('');
  const [anrufNotiz, setAnrufNotiz] = useState('');
  const [mailAn, setMailAn] = useState(s?.mail?.an ?? f.kunden_mail ?? '');
  const [betreff, setBetreff] = useState(s?.mail?.betreff ?? '');
  const [mailText, setMailText] = useState(s?.mail?.text ?? '');
  const [waText, setWaText] = useState(s?.whatsapp ?? '');
  const [panel, setPanel] = useState<Panel>(hervorheben ? 'verlauf' : null);
  const [notiz, setNotiz] = useState('');
  const [krise, setKrise] = useState({ grund: '', vereinbarung: '', raten: '', betrag: '', naechster_kontakt: '', einschaetzung: '', notiz: '' });
  const [frage, setFrage] = useState('');
  const [empfehlung, setEmpfehlung] = useState('');
  const offeneEntscheidung = f.entscheidungen.find((e) => e.status === 'offen');
  const letzteEntscheidung = f.entscheidungen.find((e) => e.status !== 'offen');

  const umschalten = (p: Panel) => setPanel((x) => (x === p ? null : p));
  const wa = s?.whatsapp ? waLink(f.telefon, waText) : null;

  return (
    <Card padding="none" id={`fall-${f.id}`} className={`p-4 space-y-3 ${hervorheben ? 'ring-2 ring-red-500' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-gray-900">{f.kunde ?? f.kontakt_name}</span>
        <span className="text-xs text-gray-500">
          {f.rechnungsnummer} · <b className="text-gray-800">{euro(f.betrag_offen)}</b> offen · fällig seit {datum(f.zahlungsziel)} ({tageSeit(f.zahlungsziel)} Tage)
        </span>
        {f.status === 'anwalt' && <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 text-white">⚖️ beim Anwalt</span>}
        {f.zugesagt_bis && <span className="text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-700">🤝 zugesagt bis {datum(f.zugesagt_bis)}</span>}
        {f.einschaetzung && <span className={`text-[11px] px-1.5 py-0.5 rounded ${EINSCHAETZUNG[f.einschaetzung].cls}`}>{EINSCHAETZUNG[f.einschaetzung].label}</span>}
        {offeneEntscheidung && <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">🧭 wartet auf Felix</span>}
      </div>

      {letzteEntscheidung && (
        <p className="text-xs rounded-lg bg-purple-50 text-purple-800 px-3 py-2">
          ⚖️ Felix: <b>{{ ja: 'Ja', nein: 'Nein', erledigt: 'Erledigt', verschoben: 'Verschoben' }[letzteEntscheidung.status] ?? letzteEntscheidung.status}</b>
          {letzteEntscheidung.notiz ? ` – ${letzteEntscheidung.notiz}` : ''} <span className="text-purple-500">({letzteEntscheidung.titel.replace(/^💶 /, '')})</span>
        </p>
      )}

      {s ? (
        <div className="space-y-3 rounded-xl border border-red-100 bg-red-50/40 p-3">
          <p className="text-sm font-bold text-red-700 flex flex-wrap items-center gap-2">
            {s.schritt === 7 ? <Scale className="w-4 h-4" /> : <PhoneCall className="w-4 h-4" />} Vorschlag – Schritt {s.schritt}: {s.titel}
            {f.telefon && <a href={`tel:${f.telefon}`} className="text-xs font-semibold text-red-600 underline">{f.telefon}</a>}
          </p>
          <p className="text-[11px] text-gray-500">Nichts wird automatisch verschickt. Bitte prüfen, anpassen und selbst absenden.</p>

          {s.telefon && (
            <details>
              <summary className="text-xs font-semibold text-gray-600 cursor-pointer">📞 Telefonleitfaden</summary>
              <p className="text-sm text-gray-700 whitespace-pre-line mt-1 bg-white rounded-lg p-3">{s.telefon}</p>
            </details>
          )}

          {s.schritt < 7 && (
            <div className="flex flex-wrap items-center gap-2">
              <input className={`${inputCls} w-56`} placeholder="Notiz zum Anruf" value={anrufNotiz} onChange={(e) => setAnrufNotiz(e.target.value)} />
              <label className="text-xs text-gray-600 flex items-center gap-1.5">
                zahlt bis <input type="date" className={inputCls} value={zusage} onChange={(e) => setZusage(e.target.value)} />
              </label>
              <button onClick={() => post({ aktion: 'mahn_aktion', case_id: f.id, schritt: s.schritt, ergebnis: 'erreicht', notiz: anrufNotiz, zugesagt_bis: zusage || null })} className="h-9 px-3 rounded-lg bg-green-600 text-white text-xs font-semibold">
                ✅ Erreicht
              </button>
              <button onClick={() => post({ aktion: 'mahn_aktion', case_id: f.id, schritt: s.schritt, ergebnis: 'nicht_erreicht', notiz: anrufNotiz })} className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold">
                📵 Nicht erreicht
              </button>
            </div>
          )}

          {s.mail && s.schritt < 7 && (
            <details>
              <summary className="text-xs font-semibold text-gray-600 cursor-pointer">✉️ Mail prüfen & senden</summary>
              <div className="mt-2 space-y-2">
                <input className={`${inputCls} w-full`} placeholder="Empfänger" value={mailAn} onChange={(e) => setMailAn(e.target.value)} />
                <input className={`${inputCls} w-full`} placeholder="Betreff" value={betreff} onChange={(e) => setBetreff(e.target.value)} />
                <textarea className={areaCls} rows={8} value={mailText} onChange={(e) => setMailText(e.target.value)} />
                <button
                  onClick={() => {
                    if (!window.confirm(`Mail jetzt an ${mailAn} senden?`)) return;
                    void post({ aktion: 'mahn_mail', case_id: f.id, schritt: s.schritt, an: mailAn, betreff, text: mailText });
                  }}
                  disabled={!mailAn}
                  className="h-9 px-3 rounded-lg bg-gradient-to-b from-red-700 to-red-950 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Mail className="w-3.5 h-3.5" /> Geprüft – jetzt senden
                </button>
              </div>
            </details>
          )}

          {s.whatsapp && (
            <details>
              <summary className="text-xs font-semibold text-gray-600 cursor-pointer">💬 WhatsApp prüfen & senden</summary>
              <div className="mt-2 space-y-2">
                <textarea className={areaCls} rows={5} value={waText} onChange={(e) => setWaText(e.target.value)} />
                {wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => void post({ aktion: 'mahn_whatsapp', case_id: f.id, schritt: s.schritt, text: waText })}
                    className="h-9 px-3 rounded-lg bg-green-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> In WhatsApp öffnen & senden
                  </a>
                ) : (
                  <p className="text-xs text-gray-500">Keine Handynummer beim Kunden hinterlegt.</p>
                )}
              </div>
            </details>
          )}

          {s.schritt === 7 && s.mail && (
            <div className="text-sm bg-white rounded-lg p-3 space-y-2">
              <p className="text-xs text-gray-500">An: {s.mail.an} · Betreff: {s.mail.betreff}</p>
              <p className="whitespace-pre-line text-gray-700">{s.mail.text}</p>
              <div className="flex flex-wrap gap-2">
                <a href={`mailto:${s.mail.an}?subject=${encodeURIComponent(s.mail.betreff)}&body=${encodeURIComponent(s.mail.text)}`} className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> Im Mailprogramm öffnen (Vertrag anhängen!)
                </a>
                <button
                  onClick={() => window.confirm('Fall an den Anwalt abgegeben? Der Kunde wird pausiert.') && void post({ aktion: 'mahn_aktion', case_id: f.id, schritt: 7, ergebnis: 'abgegeben' })}
                  className="h-9 px-3 rounded-lg bg-gray-900 text-white text-xs font-semibold"
                >
                  ⚖️ An Anwalt abgegeben → Kunde pausieren
                </button>
              </div>
              <p className="text-[11px] text-gray-500">Tipp: Vor dem Anwalt mit „An Felix“ kurz die Freigabe holen.</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500">{f.naechster ? `⏭️ Nächster Schritt: ${f.naechster.titel} am ${datum(f.naechster.datum)}` : 'Kein weiterer Schritt.'}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => umschalten('notiz')} className={`h-8 px-3 rounded-full text-xs font-semibold border ${panel === 'notiz' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200'}`}><StickyNote className="w-3.5 h-3.5 inline mr-1" />Notiz</button>
        <button onClick={() => umschalten('krise')} className={`h-8 px-3 rounded-full text-xs font-semibold border ${panel === 'krise' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200'}`}><LifeBuoy className="w-3.5 h-3.5 inline mr-1" />Krisengespräch</button>
        <button onClick={() => umschalten('felix')} className={`h-8 px-3 rounded-full text-xs font-semibold border ${panel === 'felix' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200'}`}><Compass className="w-3.5 h-3.5 inline mr-1" />An Felix zur Entscheidung</button>
        <button onClick={() => umschalten('verlauf')} className={`h-8 px-3 rounded-full text-xs font-semibold border ${panel === 'verlauf' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200'}`}><History className="w-3.5 h-3.5 inline mr-1" />Verlauf ({f.verlauf.length})</button>
      </div>

      {panel === 'notiz' && (
        <div className="space-y-2">
          <textarea className={areaCls} rows={3} placeholder="Was ist passiert? (z. B. Rückruf vereinbart, Kunde im Urlaub …)" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
          <button onClick={async () => (await post({ aktion: 'mahn_notiz', case_id: f.id, notiz })) && setNotiz('')} className="h-9 px-3 rounded-lg bg-gray-900 text-white text-xs font-semibold">Notiz speichern</button>
        </div>
      )}

      {panel === 'krise' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <textarea className={`${areaCls} sm:col-span-2`} rows={2} placeholder="Warum zahlt der Kunde nicht? (Liquidität, Unzufriedenheit, Streit …)" value={krise.grund} onChange={(e) => setKrise({ ...krise, grund: e.target.value })} />
          <select className={inputCls} value={krise.vereinbarung} onChange={(e) => setKrise({ ...krise, vereinbarung: e.target.value })}>
            <option value="">Vereinbarung …</option>
            <option>Zahlt komplett bis Datum</option>
            <option>Ratenzahlung</option>
            <option>Teilzahlung</option>
            <option>Stundung</option>
            <option>Keine Einigung</option>
          </select>
          <input className={inputCls} placeholder="Raten (z. B. 3 × 500 € zum 1.)" value={krise.raten} onChange={(e) => setKrise({ ...krise, raten: e.target.value })} />
          <input className={inputCls} placeholder="Betrag / Anzahlung" value={krise.betrag} onChange={(e) => setKrise({ ...krise, betrag: e.target.value })} />
          <label className="text-xs text-gray-600 flex items-center gap-1.5">Nächster Kontakt / zahlt bis <input type="date" className={inputCls} value={krise.naechster_kontakt} onChange={(e) => setKrise({ ...krise, naechster_kontakt: e.target.value })} /></label>
          <div className="flex gap-1.5 sm:col-span-2">
            {(['zahlt', 'unsicher', 'ausfall'] as const).map((e) => (
              <button key={e} onClick={() => setKrise({ ...krise, einschaetzung: e })} className={`h-8 px-3 rounded-full text-xs font-semibold border ${krise.einschaetzung === e ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200'} ${EINSCHAETZUNG[e].cls}`}>{EINSCHAETZUNG[e].label}</button>
            ))}
          </div>
          <textarea className={`${areaCls} sm:col-span-2`} rows={3} placeholder="Gesprächsnotiz" value={krise.notiz} onChange={(e) => setKrise({ ...krise, notiz: e.target.value })} />
          <button
            onClick={async () => (await post({ aktion: 'mahn_krise', case_id: f.id, ...krise })) && setKrise({ grund: '', vereinbarung: '', raten: '', betrag: '', naechster_kontakt: '', einschaetzung: '', notiz: '' })}
            className="h-9 px-3 rounded-lg bg-gray-900 text-white text-xs font-semibold sm:col-span-2 justify-self-start"
          >
            🆘 Krisengespräch speichern
          </button>
        </div>
      )}

      {panel === 'felix' && (
        <div className="space-y-2">
          {offeneEntscheidung && <p className="text-xs text-purple-700">Es wartet schon eine Frage auf Felix: „{offeneEntscheidung.titel.replace(/^💶 /, '')}“</p>}
          <input className={`${inputCls} w-full`} placeholder="Was soll Felix entscheiden? (z. B. Ratenzahlung 3 × 500 € annehmen?)" value={frage} onChange={(e) => setFrage(e.target.value)} />
          <textarea className={areaCls} rows={2} placeholder="Deine Empfehlung (optional)" value={empfehlung} onChange={(e) => setEmpfehlung(e.target.value)} />
          <button onClick={async () => (await post({ aktion: 'mahn_eskalation', case_id: f.id, frage, empfehlung })) && (setFrage(''), setEmpfehlung(''))} className="h-9 px-3 rounded-lg bg-purple-700 text-white text-xs font-semibold">
            🧭 An Felix senden
          </button>
          <p className="text-[11px] text-gray-500">Landet im Cockpit und im Morgen-Briefing. Seine Antwort kommt hier im Fall an.</p>
        </div>
      )}

      {panel === 'verlauf' && <Verlauf f={f} />}

      <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-gray-400">
        <button onClick={() => window.confirm('Als bezahlt markieren?') && void post({ aktion: 'mahn_status', case_id: f.id, status: 'bezahlt' })} className="hover:text-gray-700">✔️ bezahlt</button>
        <button onClick={() => window.confirm('Fall ignorieren (z. B. Altfall, Gutschrift)?') && void post({ aktion: 'mahn_status', case_id: f.id, status: 'ignoriert' })} className="hover:text-gray-700">🙈 ignorieren</button>
      </div>
    </Card>
  );
}

function Bericht({ b }: { b: MahnBericht }) {
  const kachel = (titel: string, wert: string, sub?: string, rot = false) => (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{titel}</p>
      <p className={`text-lg font-bold ${rot ? 'text-red-700' : 'text-gray-900'}`}>{wert}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {kachel('💶 Offen gesamt', euro(b.offen.summe), `${b.offen.anzahl} Rechnungen`)}
        {kachel('⏰ Überfällig', euro(b.ueberfaellig.summe), `${b.ueberfaellig.anzahl} Rechnungen`, b.ueberfaellig.summe > 0)}
        {kachel('🔴 Ausfallrisiko', euro(b.ausfallRisiko), 'Mahnung 3+, Ausfall droht, Anwalt', b.ausfallRisiko > 0)}
        {kachel('✅ Bezahlt (30 Tage)', euro(b.bezahlt30.summe), `${b.bezahlt30.anzahl} Rechnungen`)}
        {kachel('🤝 Zahlung zugesagt', euro(b.zugesagt.summe), `${b.zugesagt.anzahl} Fälle`)}
        {kachel('⚖️ Beim Anwalt', euro(b.anwalt.summe), `${b.anwalt.anzahl} Fälle`)}
        {kachel('🚦 Einschätzung', `🟢 ${b.einschaetzung.zahlt} · 🟡 ${b.einschaetzung.unsicher} · 🔴 ${b.einschaetzung.ausfall}`, 'aus Krisengesprächen')}
      </div>
      {!!b.nachSchritt.length && (
        <Card padding="none" className="p-4">
          <p className="text-sm font-bold text-gray-900 mb-2">📊 Überfällig nach Mahnstufe</p>
          {b.nachSchritt.map((x) => (
            <div key={x.schritt} className="flex justify-between py-1 text-sm">
              <span className="text-gray-600">Schritt {x.schritt}: {x.titel}</span>
              <span className="font-semibold">{x.anzahl} · {euro(x.summe)}</span>
            </div>
          ))}
        </Card>
      )}
      {!!b.schuldner.length && (
        <Card padding="none" className="p-4">
          <p className="text-sm font-bold text-gray-900 mb-2">🧾 Größte offene Posten</p>
          {b.schuldner.map((x) => (
            <div key={x.kunde} className="flex flex-wrap justify-between gap-2 py-1 text-sm">
              <span className="text-gray-800">{x.kunde} {x.einschaetzung && <span className="text-xs">{EINSCHAETZUNG[x.einschaetzung]?.label}</span>}</span>
              <span className="text-gray-500 text-xs self-center">{x.aeltesteTage} Tage · Schritt {x.schritt}</span>
              <span className="font-semibold">{euro(x.summe)}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export function MahnwesenTab({ d, post, fallId }: { d: MahnDaten; post: (b: Record<string, unknown>) => Promise<boolean>; fallId: string | null }) {
  const [ansicht, setAnsicht] = useState<'heute' | 'alle' | 'bericht'>('heute');
  const [ab, setAb] = useState(d.ab ?? '');
  const heute = d.faelle.filter((f) => f.faellig);
  const liste = fallId ? d.faelle.filter((f) => f.id === fallId) : ansicht === 'heute' ? heute : d.faelle;

  useEffect(() => {
    if (fallId) document.getElementById(`fall-${fallId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [fallId]);

  if (!d.ab) {
    return (
      <Card padding="none" className="p-5 space-y-3">
        <p className="text-sm font-bold text-gray-900">💶 Mahnwesen einrichten</p>
        <p className="text-sm text-gray-600">
          Ab welchem Rechnungsdatum soll die Cloud offene Rechnungen aus Lexoffice übernehmen? Ältere Rechnungen bleiben draußen.
          Es wird <b>nichts automatisch verschickt</b> – du bekommst jeden Morgen Aufgaben mit Vorschlägen und entscheidest selbst.
        </p>
        <div className="flex gap-2">
          <input type="date" className={inputCls} value={ab} onChange={(e) => setAb(e.target.value)} />
          <button onClick={() => ab && void post({ aktion: 'mahn_stichtag', ab })} disabled={!ab} className="h-9 px-3 rounded-lg bg-gradient-to-b from-red-700 to-red-950 text-white text-xs font-semibold disabled:opacity-40">
            Speichern & Lexoffice abgleichen
          </button>
        </div>
      </Card>
    );
  }

  const chip = (a: typeof ansicht, label: string) => (
    <button onClick={() => setAnsicht(a)} className={`h-8 px-3 rounded-full text-xs font-semibold ${ansicht === a && !fallId ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>{label}</button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {chip('heute', `📋 Heute dran (${heute.length})`)}
        {chip('alle', `📂 Alle offenen (${d.faelle.length})`)}
        {chip('bericht', '📊 Bericht')}
        {fallId && <a href="/buchhaltung?tab=mahnwesen" className="text-xs text-red-600 underline">Alle Fälle zeigen</a>}
        <span className="flex-1" />
        <span className="text-[11px] text-gray-500">Rechnungen ab {datum(d.ab)}</span>
        <button onClick={() => void post({ aktion: 'mahn_sync' })} className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold inline-flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Lexoffice abgleichen
        </button>
      </div>

      {ansicht === 'bericht' && !fallId ? (
        <Bericht b={d.bericht} />
      ) : (
        <>
          {liste.map((f) => <FallCard key={f.id} f={f} hervorheben={f.id === fallId} post={post} />)}
          {!liste.length && <p className="text-sm text-gray-500 text-center py-6">{ansicht === 'heute' ? '🎉 Heute ist nichts fällig.' : 'Keine offenen Mahnfälle.'}</p>}
        </>
      )}
    </div>
  );
}
