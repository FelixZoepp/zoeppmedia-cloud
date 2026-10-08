'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mic, Square, Upload, Sparkles, ThumbsDown, ThumbsUp, Check, X, Plus } from 'lucide-react';
import { Badge, Card, Input, PageHeader, SegmentedControl } from '@/components/ui';
import { SopAufnahmen } from './sop-aufnahmen';

type Tab = 'sop' | 'aufnahmen' | 'entwuerfe' | 'einspeisen' | 'luecken' | 'zugriffe' | 'feedback';

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'sop', label: 'SOP aus Aufnahmen' },
  { value: 'aufnahmen', label: 'Aufnahme-Liste' },
  { value: 'entwuerfe', label: 'Entwürfe & Freigabe' },
  { value: 'einspeisen', label: 'Wissen einspeisen' },
  { value: 'luecken', label: 'Wissenslücken' },
  { value: 'zugriffe', label: 'Zugriffe' },
  { value: 'feedback', label: 'Bot-Feedback' },
];

const knopf = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13.5px] font-medium disabled:opacity-40';
const primaer = `${knopf} bg-red-950 text-red-50`;
const sekundaer = `${knopf} bg-panel text-gray-700 hover:text-ink`;

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((d as { error?: string }).error ?? 'Fehler');
  return d as T;
}

export function AkademieVerwaltung({ startTab }: { startTab?: string }) {
  // Direktlink aus Benachrichtigung/Aufnahme-Dialog: /admin/akademie?tab=sop
  const [tab, setTab] = useState<Tab>(TABS.some((x) => x.value === startTab) ? (startTab as Tab) : 'aufnahmen');
  return (
    <div className="space-y-5">
      <PageHeader label="Verwaltung" title="Team-Akademie" description="Videos aufnehmen, Wissen einspeisen, Entwürfe freigeben und festlegen, wer was sieht." />
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <SegmentedControl items={TABS} value={tab} onChange={(v) => setTab(v as Tab)} />
      </div>
      {tab === 'sop' && <SopAufnahmen />}
      {tab === 'aufnahmen' && <Aufnahmen />}
      {tab === 'entwuerfe' && <Entwuerfe />}
      {tab === 'einspeisen' && <Einspeisen />}
      {tab === 'luecken' && <Luecken />}
      {tab === 'zugriffe' && <Zugriffe />}
      {tab === 'feedback' && <Feedback />}
    </div>
  );
}

/* ── Aufnahme-Liste ────────────────────────────────────────────────── */

interface VideoZeile {
  key: string;
  titel: string;
  session: string;
  laenge_min: number;
  prioritaet: number;
  drehbuch: string[];
  video_url: string | null;
  status: string;
  sops: Array<{ slug: string; titel: string }>;
}

function Aufnahmen() {
  const [d, setD] = useState<{ sessions: Array<{ session: string; gesamtMin: number; videos: VideoZeile[] }>; gesamtMin: number; anzahl: number; alle: VideoZeile[] } | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const laden = useCallback(() => json<typeof d>('/api/akademie/videos').then(setD).catch((e) => setMsg(String(e.message ?? e))), []);
  useEffect(() => { laden(); }, [laden]);

  async function speichern(key: string, patch: Record<string, unknown>) {
    try {
      await json('/api/akademie/videos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, ...patch }) });
      setMsg('Gespeichert');
      laden();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (!d) return <Card className="p-5 text-[15px] text-gray-500">{msg ?? 'Lädt …'}</Card>;
  const fertig = d.alle.filter((v) => v.status !== 'aufnahme_noetig');
  return (
    <div className="space-y-4">
      <Card className="p-4 text-[15px]">
        <strong>{d.anzahl} Videos offen</strong> · zusammen ca. <strong>{d.gesamtMin} Minuten</strong> Aufnahme. Sessions am Stück aufnehmen (Loom o. ä.), danach Link eintragen – die SOPs zeigen das Video sofort.
        {msg && <span className="ml-2 text-gray-500">{msg}</span>}
      </Card>
      {d.sessions.map((s) => (
        <Card key={s.session} className="p-4">
          <h3 className="text-[16px] font-semibold">{s.session} <span className="text-[13px] font-normal text-gray-500">· {s.gesamtMin} Min.</span></h3>
          <div className="mt-3 space-y-4">
            {s.videos.map((v) => (
              <div key={v.key} className="rounded-[12px] bg-panel/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-medium">{v.titel}</span>
                  <Badge tone="neutral">{v.laenge_min} Min.</Badge>
                  <Badge tone={v.prioritaet === 1 ? 'softAccent' : 'outline'}>Prio {v.prioritaet}</Badge>
                </div>
                <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[14px] text-gray-700">{v.drehbuch.map((p, i) => <li key={i}>{p}</li>)}</ol>
                {!!v.sops.length && <p className="mt-2 text-[12.5px] text-gray-500">Für: {v.sops.map((x) => x.titel).join(' · ')}</p>}
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input value={urls[v.key] ?? ''} onChange={(e) => setUrls({ ...urls, [v.key]: e.target.value })} placeholder="Video-Link (Loom, YouTube, Vimeo, Drive)" className="flex-1" />
                  <button className={primaer} disabled={!urls[v.key]} onClick={() => speichern(v.key, { video_url: urls[v.key] })}>Link speichern</button>
                  <button className={sekundaer} onClick={() => speichern(v.key, { status: 'nicht_noetig' })}>Nicht nötig</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
      {fertig.length > 0 && (
        <Card className="p-4">
          <h3 className="text-[15px] font-semibold">Erledigt / nicht nötig</h3>
          <ul className="mt-2 space-y-1 text-[14px]">
            {fertig.map((v) => (
              <li key={v.key} className="flex flex-wrap items-center gap-2">
                <span>{v.titel}</span>
                <Badge tone={v.status === 'aufgenommen' ? 'success' : 'neutral'}>{v.status === 'aufgenommen' ? 'aufgenommen' : 'nicht nötig'}</Badge>
                <button className="text-[13px] text-red-800 hover:underline" onClick={() => speichern(v.key, { status: 'aufnahme_noetig', video_url: null })}>zurück auf offen</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ── Entwürfe & Freigabe ──────────────────────────────────────────── */

interface ArtikelKurz { slug: string; typ: string; titel: string; modul: string; positionen: string[]; status: string; zusammenfassung: string | null; ergaenzt_slug: string | null }

function Entwuerfe() {
  const router = useRouter();
  const [artikel, setArtikel] = useState<ArtikelKurz[] | null>(null);
  const [positionen, setPositionen] = useState<Array<{ id: string; label: string }>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [neu, setNeu] = useState({ titel: '', typ: 'wissen', modul: 'Wissen', position: 'grundlagen' });
  const laden = useCallback(() => json<{ artikel: ArtikelKurz[]; positionen: Array<{ id: string; label: string }> }>('/api/akademie').then((d) => { setArtikel(d.artikel); setPositionen(d.positionen); }).catch((e) => setMsg(e.message)), []);
  useEffect(() => { laden(); }, [laden]);

  async function aktion(url: string, init: RequestInit, ok: string) {
    try {
      await json(url, init);
      setMsg(ok);
      laden();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (!artikel) return <Card className="p-5 text-[15px] text-gray-500">{msg ?? 'Lädt …'}</Card>;
  const entwuerfe = artikel.filter((a) => a.status === 'entwurf');
  const label = (p: string) => positionen.find((x) => x.id === p)?.label ?? p;
  const proPosition = positionen.map((p) => ({ ...p, offen: entwuerfe.filter((a) => a.positionen.includes(p.id)).length })).filter((p) => p.offen > 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-[15px] font-semibold">Wissens-To-do je Position</h3>
        <p className="mt-1 text-[14px] text-gray-600">Entwürfe sind für Mitarbeiter unsichtbar, bis du sie freigibst. Skripte und Rollen enthalten Leitfragen „Felix ergänzt“ – fülle sie direkt oder speise Wissen ein.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{proPosition.map((p) => <Badge key={p.id} tone="warning">{p.label}: {p.offen}</Badge>)}{!proPosition.length && <Badge tone="success">Keine offenen Entwürfe</Badge>}</div>
        {msg && <p className="mt-2 text-[13px] text-gray-500">{msg}</p>}
      </Card>
      <Card className="p-4">
        <h3 className="text-[15px] font-semibold">Neuen Artikel anlegen</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
          <Input value={neu.titel} onChange={(e) => setNeu({ ...neu, titel: e.target.value })} placeholder="Titel" />
          <select value={neu.typ} onChange={(e) => setNeu({ ...neu, typ: e.target.value })} className="h-11 rounded-[12px] bg-card px-3 text-[14px] shadow-[inset_0_0_0_1.5px_var(--hair)]">
            {['sop', 'skript', 'wissen', 'faq', 'rolle'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Input value={neu.modul} onChange={(e) => setNeu({ ...neu, modul: e.target.value })} placeholder="Modul" />
          <select value={neu.position} onChange={(e) => setNeu({ ...neu, position: e.target.value })} className="h-11 rounded-[12px] bg-card px-3 text-[14px] shadow-[inset_0_0_0_1.5px_var(--hair)]">
            {positionen.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button
            className={primaer}
            disabled={neu.titel.trim().length < 3}
            onClick={async () => {
              try {
                const r = await json<{ slug: string }>('/api/akademie/artikel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titel: neu.titel, typ: neu.typ, modul: neu.modul, positionen: [neu.position] }) });
                router.push(`/admin/akademie/artikel/${r.slug}`);
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            <Plus className="h-4 w-4" /> Anlegen
          </button>
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="text-[15px] font-semibold">Entwürfe ({entwuerfe.length})</h3>
        <ul className="mt-2 divide-y divide-[var(--hair)]">
          {entwuerfe.map((a) => (
            <li key={a.slug} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link href={`/akademie/${a.slug}`} className="text-[15px] font-medium hover:text-red-800">{a.titel}</Link>
                  <Badge tone="neutral">{a.typ}</Badge>
                  {a.positionen.map((p) => <Badge key={p} tone="outline">{label(p)}</Badge>)}
                  {a.ergaenzt_slug && <Badge tone="softAccent">Ergänzt: {a.ergaenzt_slug}</Badge>}
                </div>
                {a.zusammenfassung && <p className="mt-0.5 text-[13.5px] text-gray-600">{a.zusammenfassung}</p>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Link href={`/admin/akademie/artikel/${a.slug}`} className={sekundaer}>Bearbeiten</Link>
                {a.ergaenzt_slug ? (
                  <button className={primaer} onClick={() => aktion(`/api/akademie/artikel/${a.slug}/uebernehmen`, { method: 'POST' }, 'In den Artikel übernommen')}><Check className="h-4 w-4" /> Übernehmen</button>
                ) : (
                  <button className={primaer} onClick={() => aktion(`/api/akademie/artikel/${a.slug}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'freigegeben' }) }, 'Freigegeben')}><Check className="h-4 w-4" /> Freigeben</button>
                )}
                <button className={sekundaer} onClick={() => confirm(`„${a.titel}“ verwerfen?`) && aktion(`/api/akademie/artikel/${a.slug}`, { method: 'DELETE' }, 'Verworfen')}><X className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ── Wissen einspeisen ────────────────────────────────────────────── */

function Einspeisen() {
  const [art, setArt] = useState<'text' | 'datei' | 'audio' | 'gespraech'>('text');
  const [titel, setTitel] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [text, setText] = useState('');
  const [datei, setDatei] = useState<File | null>(null);
  const [gespraeche, setGespraeche] = useState<Array<{ fireflies_id: string; titel: string | null; datum: string | null; punkte: number | null }>>([]);
  const [gespraech, setGespraech] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<{ slugs?: string[]; fehler?: string } | null>(null);
  const [aufnahme, setAufnahme] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (art === 'gespraech' && !gespraeche.length) json<{ gespraeche: typeof gespraeche }>('/api/akademie/gespraeche').then((d) => setGespraeche(d.gespraeche)).catch(() => {});
  }, [art, gespraeche.length]);

  async function aufnahmeStarten() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const r = new MediaRecorder(stream);
    chunks.current = [];
    r.ondataavailable = (e) => chunks.current.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setDatei(new File(chunks.current, `sprachnachricht-${Date.now()}.webm`, { type: 'audio/webm' }));
    };
    r.start();
    recorder.current = r;
    setAufnahme(true);
  }

  async function absenden() {
    setLaeuft(true);
    setErgebnis(null);
    const fd = new FormData();
    fd.set('art', art);
    fd.set('titel', titel);
    if (hinweis) fd.set('hinweis', hinweis);
    if (art === 'text') fd.set('text', text);
    if ((art === 'datei' || art === 'audio') && datei) fd.set('datei', datei);
    if (art === 'gespraech') fd.set('fireflies_id', gespraech);
    try {
      const r = await json<{ slugs: string[] }>('/api/akademie/import', { method: 'POST', body: fd });
      setErgebnis({ slugs: r.slugs });
    } catch (e) {
      setErgebnis({ fehler: (e as Error).message });
    } finally {
      setLaeuft(false);
    }
  }

  const bereit = art === 'text' ? text.trim().length >= 20 : art === 'gespraech' ? !!gespraech : !!datei;

  return (
    <Card className="space-y-3 p-4">
      <p className="text-[14px] text-gray-600">Was du hier einspeist, macht die KI zu Artikel-Entwürfen (neu oder als Ergänzung bestehender SOPs) und ordnet sie Positionen zu. Nichts davon sehen Mitarbeiter, bevor du freigibst.</p>
      <SegmentedControl
        items={[{ value: 'text', label: 'Text' }, { value: 'datei', label: 'Datei' }, { value: 'audio', label: 'Sprachnachricht' }, { value: 'gespraech', label: 'Gespräch' }]}
        value={art}
        onChange={(v) => { setArt(v as typeof art); setDatei(null); }}
      />
      <Input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Titel, z. B. „So führe ich Closing-Calls“" />
      {art === 'text' && <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder="Wissen, Skript, Notizen einfügen …" className="w-full rounded-[12px] bg-card p-3 text-[15px] shadow-[inset_0_0_0_1.5px_var(--hair)]" />}
      {art === 'datei' && <label className={`${sekundaer} cursor-pointer`}><Upload className="h-4 w-4" /> {datei ? datei.name : 'PDF, TXT oder MD wählen'}<input type="file" accept=".pdf,.txt,.md" className="hidden" onChange={(e) => setDatei(e.target.files?.[0] ?? null)} /></label>}
      {art === 'audio' && (
        <div className="flex flex-wrap items-center gap-2">
          {!aufnahme ? (
            <button className={primaer} onClick={aufnahmeStarten}><Mic className="h-4 w-4" /> Aufnahme starten</button>
          ) : (
            <button className={primaer} onClick={() => { recorder.current?.stop(); setAufnahme(false); }}><Square className="h-4 w-4" /> Aufnahme beenden</button>
          )}
          <label className={`${sekundaer} cursor-pointer`}><Upload className="h-4 w-4" /> Audio hochladen<input type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg" className="hidden" onChange={(e) => setDatei(e.target.files?.[0] ?? null)} /></label>
          {datei && <span className="text-[13px] text-gray-600">{datei.name}</span>}
        </div>
      )}
      {art === 'gespraech' && (
        <select value={gespraech} onChange={(e) => setGespraech(e.target.value)} className="h-11 w-full rounded-[12px] bg-card px-3 text-[14px] shadow-[inset_0_0_0_1.5px_var(--hair)]">
          <option value="">Gespräch wählen (beste zuerst) …</option>
          {gespraeche.map((g) => <option key={g.fireflies_id} value={g.fireflies_id}>{g.punkte != null ? `${g.punkte} Pkt · ` : ''}{g.titel ?? 'Gespräch'}{g.datum ? ` · ${new Date(g.datum).toLocaleDateString('de-DE')}` : ''}</option>)}
        </select>
      )}
      <Input value={hinweis} onChange={(e) => setHinweis(e.target.value)} placeholder="Hinweis an die KI (optional), z. B. „Daraus das Closing-Skript ergänzen“" />
      <button className={primaer} disabled={!bereit || laeuft} onClick={absenden}><Sparkles className="h-4 w-4" /> {laeuft ? 'KI arbeitet … (bis 1–2 Min.)' : 'Entwürfe erzeugen'}</button>
      {ergebnis?.fehler && <p className="text-[14px] text-red-700">{ergebnis.fehler}</p>}
      {ergebnis?.slugs && (
        <div className="text-[14px]">
          <p className="font-medium">{ergebnis.slugs.length} Entwürfe erstellt:</p>
          <ul className="mt-1 list-disc pl-5">{ergebnis.slugs.map((s) => <li key={s}><Link href={`/akademie/${s}`} className="text-red-800 hover:underline">{s}</Link></li>)}</ul>
          <p className="mt-1 text-gray-600">Freigeben unter „Entwürfe & Freigabe“.</p>
        </div>
      )}
    </Card>
  );
}

/* ── Wissenslücken ────────────────────────────────────────────────── */

function Luecken() {
  const [liste, setListe] = useState<Array<{ id: string; frage: string; anzahl: number; status: string; artikel_slug: string | null; zuletzt_am: string }> | null>(null);
  const [notiz, setNotiz] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const laden = useCallback(() => json<{ luecken: NonNullable<typeof liste> }>('/api/akademie/luecken').then((d) => setListe(d.luecken)).catch((e) => setMsg(e.message)), []);
  useEffect(() => { laden(); }, [laden]);

  if (!liste) return <Card className="p-5 text-[15px] text-gray-500">{msg ?? 'Lädt …'}</Card>;
  return (
    <Card className="p-4">
      <p className="text-[14px] text-gray-600">Fragen, die der Bot nicht beantworten konnte – häufigste zuerst. Schreib kurz deine Antwort dazu, dann erstellt die KI daraus einen Entwurf.</p>
      {msg && <p className="mt-1 text-[13px] text-gray-500">{msg}</p>}
      <ul className="mt-3 space-y-3">
        {liste.map((l) => (
          <li key={l.id} className="rounded-[12px] bg-panel/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-medium">{l.frage}</span>
              <Badge tone="warning">{l.anzahl}×</Badge>
              <Badge tone={l.status === 'offen' ? 'softAccent' : 'neutral'}>{l.status}</Badge>
              {l.artikel_slug && <Link href={`/akademie/${l.artikel_slug}`} className="text-[13px] text-red-800 hover:underline">Entwurf ansehen</Link>}
            </div>
            {l.status === 'offen' && (
              <div className="mt-2 flex flex-col gap-2">
                <textarea value={notiz[l.id] ?? ''} onChange={(e) => setNotiz({ ...notiz, [l.id]: e.target.value })} rows={3} placeholder="Deine Antwort (optional – ohne Antwort entsteht ein Gerüst mit Leitfragen)" className="w-full rounded-[12px] bg-card p-2.5 text-[14px] shadow-[inset_0_0_0_1.5px_var(--hair)]" />
                <div className="flex flex-wrap gap-1.5">
                  <button
                    className={primaer}
                    disabled={laeuft === l.id}
                    onClick={async () => {
                      setLaeuft(l.id);
                      try {
                        await json(`/api/akademie/luecken/${l.id}/entwurf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notiz: notiz[l.id] ?? '' }) });
                        setMsg('Entwurf erstellt – unter „Entwürfe & Freigabe“');
                        laden();
                      } catch (e) {
                        setMsg((e as Error).message);
                      } finally {
                        setLaeuft(null);
                      }
                    }}
                  >
                    <Sparkles className="h-4 w-4" /> {laeuft === l.id ? 'KI arbeitet …' : 'Entwurf erzeugen'}
                  </button>
                  <button className={sekundaer} onClick={() => json('/api/akademie/luecken', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id, status: 'ignoriert' }) }).then(laden)}>Ignorieren</button>
                </div>
              </div>
            )}
          </li>
        ))}
        {!liste.length && <li className="text-[15px] text-gray-600">Noch keine Wissenslücken.</li>}
      </ul>
    </Card>
  );
}

/* ── Zugriffe ─────────────────────────────────────────────────────── */

interface Mitarbeiter { id: string; name: string; email: string; role: string; funktion: string | null; aktiv: boolean | null; admin: boolean; vorschlag: string[]; positionen: string[]; schalter: Array<{ position: string; an: boolean }> }

function Zugriffe() {
  const [d, setD] = useState<{ mitarbeiter: Mitarbeiter[] } | null>(null);
  const [positionen, setPositionen] = useState<Array<{ id: string; label: string }>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const laden = useCallback(() => {
    json<{ mitarbeiter: Mitarbeiter[] }>('/api/akademie/zugriffe').then(setD).catch((e) => setMsg(e.message));
    json<{ positionen: Array<{ id: string; label: string }> }>('/api/akademie').then((x) => setPositionen(x.positionen)).catch(() => {});
  }, []);
  useEffect(() => { laden(); }, [laden]);

  async function schalten(userId: string, position: string, an: boolean | null) {
    try {
      await json('/api/akademie/zugriffe', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, position, an }) });
      laden();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (!d) return <Card className="p-5 text-[15px] text-gray-500">{msg ?? 'Lädt …'}</Card>;
  return (
    <Card className="p-4">
      <p className="text-[14px] text-gray-600">Häkchen = Mitarbeiter sieht die freigegebenen Artikel dieser Position in Akademie, Suche und Bot. Vorschlag kommt aus der Funktion; ein Klick überschreibt ihn, „↺“ setzt zurück. Admins sehen alles.</p>
      {msg && <p className="mt-1 text-[13px] text-red-700">{msg}</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-[14px]">
          <thead>
            <tr className="text-left text-[12.5px] text-gray-500">
              <th className="py-2 pr-3">Mitarbeiter</th>
              {positionen.map((p) => <th key={p.id} className="px-1.5 py-2 text-center font-medium">{p.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.mitarbeiter.map((m) => (
              <tr key={m.id} className="border-t border-[var(--hair)]">
                <td className="py-2 pr-3">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-[12.5px] text-gray-500">{m.admin ? 'Admin – sieht alles' : m.funktion ?? 'ohne Funktion'}{m.aktiv === false ? ' · deaktiviert' : ''}</div>
                </td>
                {positionen.map((p) => {
                  const an = m.admin || m.positionen.includes(p.id);
                  const manuell = m.schalter.some((s) => s.position === p.id);
                  return (
                    <td key={p.id} className="px-1.5 py-2 text-center">
                      {m.admin ? (
                        <Check className="mx-auto h-4 w-4 text-gray-300" />
                      ) : (
                        <span className="inline-flex items-center gap-0.5">
                          <input type="checkbox" checked={an} onChange={() => schalten(m.id, p.id, !an)} aria-label={`${p.label} für ${m.name}`} className="h-4 w-4 accent-red-800" />
                          {manuell && <button title="Zurück zum Vorschlag" onClick={() => schalten(m.id, p.id, null)} className="text-[12px] text-gray-400 hover:text-gray-700">↺</button>}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ── Bot-Feedback ─────────────────────────────────────────────────── */

function Feedback() {
  const [liste, setListe] = useState<Array<{ id: string; frage: string; antwort: string; luecke: boolean; bewertung: number | null; created_at: string; user: { name: string } | null }> | null>(null);
  useEffect(() => { json<{ antworten: NonNullable<typeof liste> }>('/api/akademie/bot').then((d) => setListe(d.antworten)).catch(() => setListe([])); }, []);
  if (!liste) return <Card className="p-5 text-[15px] text-gray-500">Lädt …</Card>;
  const hoch = liste.filter((x) => x.bewertung === 1).length;
  const runter = liste.filter((x) => x.bewertung === -1).length;
  return (
    <Card className="p-4">
      <p className="text-[14px] text-gray-600">{liste.length} letzte Antworten · <ThumbsUp className="inline h-3.5 w-3.5" /> {hoch} · <ThumbsDown className="inline h-3.5 w-3.5" /> {runter} · Lücken {liste.filter((x) => x.luecke).length}</p>
      <ul className="mt-3 divide-y divide-[var(--hair)]">
        {liste.map((x) => (
          <li key={x.id} className="py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-gray-500">
              <span>{x.user?.name ?? '–'}</span>
              <span>{new Date(x.created_at).toLocaleString('de-DE')}</span>
              {x.luecke && <Badge tone="warning">Lücke</Badge>}
              {x.bewertung === 1 && <ThumbsUp className="h-4 w-4 text-green-700" />}
              {x.bewertung === -1 && <ThumbsDown className="h-4 w-4 text-red-700" />}
            </div>
            <p className="mt-0.5 text-[15px] font-medium">{x.frage}</p>
            <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[14px] text-gray-700">{x.antwort}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
