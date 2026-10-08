'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Mic, Square, RefreshCw, Trash2, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { Badge, Card } from '@/components/ui';

interface OffeneFrage { frage: string; antwort?: string | null }
interface Zeile {
  id: string;
  erstellt_von: string | null;
  modus: 'audio' | 'bildschirm' | 'datei';
  titel: string;
  kontext: { pfad?: string; seitentitel?: string };
  dauer_sek: number | null;
  status: string;
  fehler: string | null;
  artikel_slug: string | null;
  video_key: string | null;
  offene_fragen: OffeneFrage[];
  versuche: number;
  created_at: string;
}
interface Detail { aufnahme: Zeile & { transkript: string | null }; bilder: string[]; video: string | null }
interface TeamNutzer { id: string; name: string | null; role: string; funktion: string | null }

const STATUS: Record<string, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' | 'softAccent' }> = {
  hochladen: { label: 'Upload läuft/abgebrochen', tone: 'neutral' },
  wartet: { label: 'wartet', tone: 'warning' },
  transkription: { label: 'Transkription …', tone: 'softAccent' },
  entwurf: { label: 'SOP wird geschrieben …', tone: 'softAccent' },
  pruefung: { label: 'Prüfung auf Lücken …', tone: 'softAccent' },
  fertig: { label: 'Entwurf fertig', tone: 'success' },
  fehler: { label: 'Fehler', tone: 'danger' },
};
const MODUS: Record<string, string> = { audio: 'Audio', bildschirm: 'Bildschirm', datei: 'Datei' };
const LAEUFT = ['wartet', 'transkription', 'entwurf', 'pruefung'];

const knopf = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13.5px] font-medium disabled:opacity-40';
const primaer = `${knopf} bg-red-950 text-red-50`;
const sekundaer = `${knopf} bg-panel text-gray-700 hover:text-ink`;

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((d as { error?: string }).error ?? 'Fehler');
  return d as T;
}

export function SopAufnahmen() {
  const [d, setD] = useState<{ aufnahmen: Zeile[]; erlaubt: string[]; team: TeamNutzer[] } | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const laden = useCallback(() => json<typeof d>('/api/akademie/aufnahmen').then(setD).catch((e) => setMsg(e.message)), []);
  useEffect(() => { laden(); }, [laden]);
  // Solange etwas verarbeitet wird, alle 5 s aktualisieren
  const laeuft = d?.aufnahmen.some((a) => LAEUFT.includes(a.status));
  useEffect(() => {
    if (!laeuft) return;
    const t = window.setInterval(laden, 5000);
    return () => window.clearInterval(t);
  }, [laeuft, laden]);

  async function erlaubtSetzen(ids: string[]) {
    try {
      await json('/api/akademie/aufnahmen/erlaubt', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: ids }) });
      laden();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (!d) return <Card className="p-5 text-[15px] text-gray-500">{msg ?? 'Lädt …'}</Card>;
  const mitarbeiter = d.team.filter((u) => u.role === 'employee');
  return (
    <div className="space-y-4">
      <Card className="p-4 text-[15px]">
        Unten links auf jeder Seite: <strong>„SOP aufnehmen“</strong>. Sprich oder zeig die Aufgabe – die KI schreibt die SOP, prüft sie auf Lücken und stellt dir Rückfragen. Entwürfe gibst du unter „Entwürfe &amp; Freigabe“ frei.
        {msg && <span className="ml-2 text-red-800">{msg}</span>}
      </Card>

      {d.aufnahmen.length === 0 && <Card className="p-5 text-[15px] text-gray-500">Noch keine Aufnahmen.</Card>}
      {d.aufnahmen.map((a) => {
        const st = STATUS[a.status] ?? { label: a.status, tone: 'neutral' as const };
        const fragenOffen = a.offene_fragen.filter((f) => !f.antwort).length;
        return (
          <Card key={a.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button className="flex flex-1 items-center gap-2 text-left" onClick={() => setOffen(offen === a.id ? null : a.id)}>
                {offen === a.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span className="text-[15.5px] font-medium">{a.titel}</span>
              </button>
              <Badge tone="outline">{MODUS[a.modus]}</Badge>
              {a.dauer_sek ? <Badge tone="neutral">{Math.round(a.dauer_sek / 60)} Min.</Badge> : null}
              <Badge tone={st.tone}>{st.label}</Badge>
              {fragenOffen > 0 && <Badge tone="warning">{fragenOffen} offene Fragen</Badge>}
            </div>
            <p className="mt-1 text-[12.5px] text-gray-500">
              {new Date(a.created_at).toLocaleString('de-DE')} · {a.kontext.seitentitel ?? a.kontext.pfad ?? '–'}
              {a.artikel_slug && <> · <Link href={`/admin/akademie/artikel/${a.artikel_slug}`} className="text-red-800 hover:underline">Entwurf bearbeiten</Link> · <Link href={`/akademie/${a.artikel_slug}`} className="text-red-800 hover:underline">Vorschau</Link></>}
            </p>
            {a.status === 'fehler' && a.fehler && <p className="mt-1 text-[13.5px] text-red-800">{a.fehler}</p>}
            {offen === a.id && <AufnahmeDetail id={a.id} neuLaden={laden} />}
          </Card>
        );
      })}

      {mitarbeiter.length > 0 && (
        <Card className="p-4">
          <h3 className="text-[15px] font-semibold">Wer darf außer Admins SOPs aufnehmen?</h3>
          <p className="mt-0.5 text-[13px] text-gray-500">Deren Entwürfe landen ebenfalls hier zur Freigabe.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {mitarbeiter.map((u) => {
              const an = d.erlaubt.includes(u.id);
              return (
                <button key={u.id} className={an ? primaer : sekundaer} onClick={() => erlaubtSetzen(an ? d.erlaubt.filter((x) => x !== u.id) : [...d.erlaubt, u.id])}>
                  {u.name ?? 'Ohne Namen'}{u.funktion ? ` · ${u.funktion}` : ''}
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function AufnahmeDetail({ id, neuLaden }: { id: string; neuLaden: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sendet, setSendet] = useState(false);
  const [transkriptOffen, setTranskriptOffen] = useState(false);
  const [aufnahme, setAufnahme] = useState<{ rec: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null>(null);
  const [sprachnachricht, setSprachnachricht] = useState<Blob | null>(null);
  const laden = useCallback(() => json<Detail>(`/api/akademie/aufnahmen/${id}`).then(setD).catch((e) => setMsg(e.message)), [id]);
  useEffect(() => { laden(); }, [laden]);

  async function sprechen() {
    if (aufnahme) {
      await new Promise<void>((ok) => { aufnahme.rec.onstop = () => ok(); aufnahme.rec.stop(); });
      aufnahme.stream.getTracks().forEach((t) => t.stop());
      setSprachnachricht(new Blob(aufnahme.chunks, { type: aufnahme.rec.mimeType || 'audio/webm' }));
      setAufnahme(null);
      setMsg('Sprachnachricht bereit – „Antworten einarbeiten“ klicken.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(1000);
      setSprachnachricht(null);
      setAufnahme({ rec, chunks, stream });
      setMsg(null);
    } catch {
      setMsg('Kein Zugriff aufs Mikrofon.');
    }
  }

  async function antworten() {
    setSendet(true);
    setMsg('Die KI arbeitet deine Antworten ein …');
    try {
      const form = new FormData();
      form.set('text', text);
      if (sprachnachricht) form.set('audio', new File([sprachnachricht], 'antwort.webm', { type: sprachnachricht.type }));
      await json(`/api/akademie/aufnahmen/${id}/antworten`, { method: 'POST', body: form });
      setText('');
      setSprachnachricht(null);
      setMsg('Entwurf aktualisiert.');
      laden();
      neuLaden();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSendet(false);
    }
  }

  async function erneut(neuTranskribieren: boolean) {
    try {
      await json(`/api/akademie/aufnahmen/${id}/verarbeiten`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ neuTranskribieren }) });
      setMsg('Wird neu verarbeitet …');
      neuLaden();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function loeschen() {
    if (!window.confirm('Aufnahme und Rohdateien löschen? Der SOP-Entwurf bleibt erhalten, ein Aufnahme-Video wird entfernt.')) return;
    try {
      await json(`/api/akademie/aufnahmen/${id}`, { method: 'DELETE' });
      neuLaden();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (!d) return <p className="mt-3 text-[14px] text-gray-500">{msg ?? 'Lädt …'}</p>;
  const a = d.aufnahme;
  const fragen = a.offene_fragen ?? [];
  return (
    <div className="mt-3 space-y-4 border-t border-gray-100 pt-3">
      {fragen.length > 0 && (
        <div>
          <h4 className="text-[14px] font-semibold">Offene Fragen an dich</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-[14.5px]">
            {fragen.map((f, i) => (
              <li key={i} className={f.antwort ? 'text-gray-400 line-through' : ''}>{f.frage}</li>
            ))}
          </ol>
          {fragen.some((f) => !f.antwort) && (
            <div className="mt-2 space-y-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Antworten hier tippen (gern alle auf einmal, mit Nummer) – oder unten einsprechen." className="w-full rounded-[12px] bg-panel p-3 text-[14.5px] outline-none" />
              <div className="flex flex-wrap gap-2">
                <button className={aufnahme ? `${knopf} bg-red-600 text-white` : sekundaer} onClick={sprechen}>
                  {aufnahme ? <><Square className="h-4 w-4" /> Stopp</> : <><Mic className="h-4 w-4" /> Antwort einsprechen</>}
                </button>
                <button className={primaer} disabled={sendet || !!aufnahme || (!text.trim() && !sprachnachricht)} onClick={antworten}>
                  <Send className="h-4 w-4" /> Antworten einarbeiten
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {d.video && <video src={d.video} controls preload="metadata" className="aspect-video w-full rounded-[12px] bg-black" />}
      {d.bilder.length > 0 && (
        <div>
          <h4 className="text-[14px] font-semibold">Standbilder ({d.bilder.length})</h4>
          <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {d.bilder.map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Standbild ${i + 1}`} className="aspect-video w-full rounded-[8px] object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
      {a.transkript && (
        <div>
          <button className="text-[14px] font-semibold" onClick={() => setTranskriptOffen(!transkriptOffen)}>
            Transkript {transkriptOffen ? 'ausblenden' : 'anzeigen'}
          </button>
          {transkriptOffen && <p className="mt-1 whitespace-pre-wrap rounded-[12px] bg-panel p-3 text-[14px] text-gray-700">{a.transkript}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={sekundaer} onClick={() => erneut(false)} disabled={LAEUFT.includes(a.status)}><RefreshCw className="h-4 w-4" /> Erneut verarbeiten</button>
        {a.transkript && <button className={sekundaer} onClick={() => erneut(true)} disabled={LAEUFT.includes(a.status)}><RefreshCw className="h-4 w-4" /> Neu transkribieren</button>}
        <button className={`${knopf} text-red-800 hover:bg-red-50`} onClick={loeschen}><Trash2 className="h-4 w-4" /> Löschen</button>
      </div>
      {msg && <p className="text-[13.5px] text-gray-600">{msg}</p>}
    </div>
  );
}
