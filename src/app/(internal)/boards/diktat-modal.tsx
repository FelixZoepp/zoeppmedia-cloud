'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mic, Square } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { WOCHENTAGE } from '@/lib/aufgaben/regeln';
import type { Vorschlag } from '@/lib/aufgaben/diktat';
import type { BoardDaten } from './typen';
import { inputCls } from './typen';

type Phase = 'bereit' | 'aufnahme' | 'verarbeitet' | 'vorschau' | 'legt_an';

/** Aufgaben per Sprache (oder Text) – Vorschau prüfen, dann anlegen */
export function DiktatModal({ daten, onClose, onAngelegt }: { daten: BoardDaten; onClose: () => void; onAngelegt: () => void }) {
  const [phase, setPhase] = useState<Phase>('bereit');
  const [sekunden, setSekunden] = useState(0);
  const [text, setText] = useState('');
  const [transkript, setTranskript] = useState('');
  const [rueckfrage, setRueckfrage] = useState<string | null>(null);
  const [vorschlaege, setVorschlaege] = useState<Array<Vorschlag & { an: boolean }>>([]);
  const rec = useRef<MediaRecorder | null>(null);
  const teile = useRef<Blob[]>([]);
  const uhr = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (uhr.current) clearInterval(uhr.current);
      rec.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const auswerten = async (form: FormData) => {
    setPhase('verarbeitet');
    try {
      const r = await fetch('/api/boards/sprachnachricht', { method: 'POST', body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Fehler');
      setTranskript(j.transkript);
      setRueckfrage(j.rueckfrage ?? null);
      setVorschlaege((j.aufgaben as Vorschlag[]).map((v) => ({ ...v, an: true })));
      setPhase('vorschau');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler');
      setPhase('bereit');
    }
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      teile.current = [];
      r.ondataavailable = (e) => e.data.size && teile.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const typ = r.mimeType || 'audio/webm';
        const blob = new Blob(teile.current, { type: typ });
        const form = new FormData();
        form.append('audio', new File([blob], typ.includes('mp4') ? 'diktat.m4a' : 'diktat.webm', { type: typ }));
        void auswerten(form);
      };
      r.start(1000);
      rec.current = r;
      setSekunden(0);
      uhr.current = setInterval(() => setSekunden((s) => s + 1), 1000);
      setPhase('aufnahme');
    } catch {
      toast.error('Kein Zugriff aufs Mikrofon – bitte im Browser erlauben');
    }
  };

  const stopp = () => {
    if (uhr.current) clearInterval(uhr.current);
    rec.current?.stop();
  };

  const ausText = () => {
    const form = new FormData();
    form.append('text', text);
    void auswerten(form);
  };

  const anlegen = async () => {
    const auswahl = vorschlaege.filter((v) => v.an).map(({ an: _an, ...v }) => (void _an, v));
    if (!auswahl.length) return onClose();
    setPhase('legt_an');
    try {
      const r = await fetch('/api/boards/sprachnachricht/anlegen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vorschlaege: auswahl }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Fehler');
      toast.success(`${j.angelegt.length} ${j.angelegt.length === 1 ? 'Aufgabe' : 'Aufgaben'} angelegt – die Zuständigen sind benachrichtigt`);
      onAngelegt();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler');
      setPhase('vorschau');
    }
  };

  const setze = (i: number, patch: Partial<Vorschlag & { an: boolean }>) => setVorschlaege((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const rhythmusText = (v: Vorschlag) =>
    v.rhythmus === 'einmalig' ? null : v.rhythmus === 'taeglich' ? 'täglich' : v.rhythmus === 'woechentlich' ? `wöchentlich (${WOCHENTAGE[(v.wochentag ?? 1) - 1]})` : `monatlich am ${v.monatstag ?? 1}.`;

  return (
    <Modal open onClose={onClose} title="Aufgaben per Sprache" width="max-w-2xl">
      {(phase === 'bereit' || phase === 'aufnahme') && (
        <div className="space-y-4">
          <p className="text-[13.5px] text-gray-600">
            Einfach drauflos sprechen, z. B. „Nils, schneid bis Freitag das Ad-Video für Turhan, und jeden Montag die Kunden-Reports raus.“ Die KI erkennt Aufgaben,
            Zuständige, Fälligkeit und Rhythmus – du prüfst kurz und legst an.
          </p>
          <div className="flex flex-col items-center gap-3 py-4">
            {phase === 'bereit' ? (
              <button type="button" onClick={start} className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700" aria-label="Aufnahme starten">
                <Mic className="h-9 w-9" />
              </button>
            ) : (
              <button type="button" onClick={stopp} className="flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-red-700 text-white shadow-lg" aria-label="Aufnahme beenden">
                <Square className="h-8 w-8" />
              </button>
            )}
            <p className="text-[13px] text-gray-600">{phase === 'bereit' ? 'Tippen zum Aufnehmen' : `Aufnahme läuft · ${Math.floor(sekunden / 60)}:${String(sekunden % 60).padStart(2, '0')} – tippen zum Beenden`}</p>
          </div>
          {phase === 'bereit' && (
            <div>
              <p className="mb-1 text-[12.5px] font-medium text-gray-600">… oder tippen</p>
              <textarea className="min-h-[80px] w-full rounded-lg border border-gray-300 bg-white p-3 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Aufgaben in eigenen Worten …" />
              <div className="mt-2 flex justify-end">
                <Button onClick={ausText} disabled={!text.trim()}>
                  Aufgaben erkennen
                </Button>
              </div>
            </div>
          )}
          <p className="text-[12px] text-gray-500">Tipp: Unterwegs einfach eine Sprachnachricht an die Zoepp-WhatsApp-Nummer schicken – die Aufgaben werden direkt angelegt.</p>
        </div>
      )}

      {(phase === 'verarbeitet' || phase === 'legt_an') && (
        <div className="flex flex-col items-center gap-3 py-10 text-[14px] text-gray-600">
          <Loader2 className="h-7 w-7 animate-spin text-red-700" />
          {phase === 'verarbeitet' ? 'Verstehe und sortiere die Aufgaben …' : 'Lege Aufgaben an …'}
        </div>
      )}

      {phase === 'vorschau' && (
        <div className="space-y-3">
          <details className="rounded-lg bg-gray-50 p-3 text-[13px] text-gray-600">
            <summary className="cursor-pointer font-medium">Verstanden</summary>
            <p className="mt-1 whitespace-pre-wrap">{transkript}</p>
          </details>
          {rueckfrage && <p className="rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900">❓ {rueckfrage}</p>}
          {vorschlaege.length === 0 && <p className="text-[14px] text-gray-600">Keine Aufgabe erkannt.</p>}
          {vorschlaege.map((v, i) => (
            <div key={i} className={`rounded-xl border p-3 ${v.an ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-3 h-4 w-4" checked={v.an} onChange={(e) => setze(i, { an: e.target.checked })} aria-label="Übernehmen" />
                <div className="flex-1 space-y-2">
                  <input className={inputCls} value={v.titel} onChange={(e) => setze(i, { titel: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <select className={inputCls} value={v.zustaendig_id ?? ''} onChange={(e) => setze(i, { zustaendig_id: e.target.value || null })}>
                      <option value="">Ich selbst</option>
                      {daten.team.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <input type="date" className={inputCls} value={v.faellig_am ?? ''} onChange={(e) => setze(i, { faellig_am: e.target.value || null })} />
                    <select className={inputCls} value={v.rhythmus} onChange={(e) => setze(i, { rhythmus: e.target.value as Vorschlag['rhythmus'] })}>
                      <option value="einmalig">Einmalig</option>
                      <option value="taeglich">Täglich</option>
                      <option value="woechentlich">Wöchentlich</option>
                      <option value="monatlich">Monatlich</option>
                    </select>
                  </div>
                  {v.beschreibung && <p className="text-[12.5px] text-gray-600">{v.beschreibung}</p>}
                  {rhythmusText(v) && <p className="text-[12px] text-gray-500">Wiederkehrend: {rhythmusText(v)}</p>}
                </div>
              </div>
            </div>
          ))}
          <div className="flex justify-between pt-1">
            <Button variant="secondary" onClick={() => setPhase('bereit')}>
              Nochmal
            </Button>
            <Button onClick={anlegen} disabled={!vorschlaege.some((v) => v.an)}>
              {vorschlaege.filter((v) => v.an).length} anlegen
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
