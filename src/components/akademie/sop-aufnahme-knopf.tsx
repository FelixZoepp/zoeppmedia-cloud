'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Mic, MonitorUp, Upload, Pause, Play, Square, Clapperboard, Check, X } from 'lucide-react';
import { Input, Modal } from '@/components/ui';
import {
  MAX_BILDER,
  MAX_DATEI_BYTES,
  MAX_DAUER_SEK,
  audioTeileAusDatei,
  hochladen,
  kannBildschirmAufnehmen,
  standbilderAusDatei,
  starteStandbilder,
  waehleMime,
  type Standbild,
} from './aufnahme-werkzeuge';

type Modus = 'audio' | 'bildschirm' | 'datei';
type Phase = 'zu' | 'auswahl' | 'aufnahme' | 'hochladen' | 'fertig' | 'fehler';

interface Datei { art: 'audio' | 'bild' | 'video'; blob: Blob; mime: string }

const knopf = 'inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-medium disabled:opacity-40';
const primaer = `${knopf} bg-red-950 text-red-50`;
const sekundaer = `${knopf} bg-panel text-gray-700 hover:text-ink`;

const zeitText = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Kontext der aktuellen Seite: Pfad, Titel und – wenn erkennbar – Kunde/Ablauf-Schritt */
function seitenKontext(pfad: string) {
  const kunde = pfad.match(/\/clients\/([0-9a-f-]{36})/i)?.[1];
  const schritt = pfad.match(/\/akademie\/schritt\/([a-z0-9_]+)/i)?.[1] ?? new URLSearchParams(window.location.search).get('schritt') ?? undefined;
  return { pfad, seitentitel: document.title.replace(/\s*[|–-]\s*Zoepp.*$/i, '').trim() || pfad, ...(kunde ? { kunde_id: kunde } : {}), ...(schritt ? { schritt } : {}) };
}

export function SopAufnahmeKnopf() {
  const pfad = usePathname();
  const [phase, setPhase] = useState<Phase>('zu');
  const [modus, setModus] = useState<Modus>('audio');
  const [titel, setTitel] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [kontext, setKontext] = useState<Record<string, string>>({});
  const [sek, setSek] = useState(0);
  const [pausiert, setPausiert] = useState(false);
  const [prozent, setProzent] = useState(0);
  const [meldung, setMeldung] = useState<string | null>(null);

  const rec = useRef<{
    streams: MediaStream[];
    recorder: MediaRecorder[];
    chunks: { audio: Blob[]; video: Blob[] };
    mime: { audio: string; video: string };
    standbilder: { stopp: () => Standbild[] } | null;
    videoEl: HTMLVideoElement | null;
    timer: number | null;
    sek: number;
  } | null>(null);

  useEffect(() => () => aufraeumen(), []);

  function oeffnen() {
    const k = seitenKontext(pfad);
    setKontext(k);
    setTitel(k.seitentitel);
    setHinweis('');
    setMeldung(null);
    setPhase('auswahl');
  }

  function aufraeumen() {
    const r = rec.current;
    if (!r) return;
    if (r.timer) window.clearInterval(r.timer);
    r.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    r.videoEl?.remove();
    rec.current = null;
  }

  async function starten() {
    setMeldung(null);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const streams: MediaStream[] = [mic];
      const audioMime = waehleMime(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) ?? '';
      const audioRec = new MediaRecorder(mic, { ...(audioMime ? { mimeType: audioMime } : {}), audioBitsPerSecond: 32_000 });
      const chunks = { audio: [] as Blob[], video: [] as Blob[] };
      audioRec.ondataavailable = (e) => e.data.size && chunks.audio.push(e.data);
      const recorder = [audioRec];
      let videoMime = '';
      let standbilder: { stopp: () => Standbild[] } | null = null;
      let videoEl: HTMLVideoElement | null = null;

      if (modus === 'bildschirm') {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false });
        streams.push(screen);
        const gemischt = new MediaStream([...screen.getVideoTracks(), ...mic.getAudioTracks()]);
        videoMime = waehleMime(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']) ?? '';
        const videoRec = new MediaRecorder(gemischt, { ...(videoMime ? { mimeType: videoMime } : {}), videoBitsPerSecond: 600_000, audioBitsPerSecond: 32_000 });
        videoRec.ondataavailable = (e) => e.data.size && chunks.video.push(e.data);
        recorder.push(videoRec);
        videoEl = document.createElement('video');
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.srcObject = screen;
        videoEl.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(videoEl);
        await videoEl.play().catch(() => {});
        standbilder = starteStandbilder(videoEl, () => rec.current?.sek ?? 0);
        // Teilen im Browser beendet → Aufnahme beenden
        screen.getVideoTracks()[0]?.addEventListener('ended', () => beenden());
      }

      recorder.forEach((r) => r.start(1000));
      rec.current = { streams, recorder, chunks, mime: { audio: audioMime || 'audio/webm', video: videoMime || 'video/webm' }, standbilder, videoEl, timer: null, sek: 0 };
      rec.current.timer = window.setInterval(() => {
        const r = rec.current;
        if (!r || r.recorder[0].state !== 'recording') return;
        r.sek += 1;
        setSek(r.sek);
        if (r.sek >= MAX_DAUER_SEK) beenden();
      }, 1000);
      setSek(0);
      setPausiert(false);
      setPhase('aufnahme');
    } catch (err) {
      aufraeumen();
      setMeldung(err instanceof DOMException && err.name === 'NotAllowedError' ? 'Zugriff auf Mikrofon/Bildschirm wurde nicht erlaubt.' : (err as Error).message);
    }
  }

  function pauseUmschalten() {
    const r = rec.current;
    if (!r) return;
    if (pausiert) r.recorder.forEach((x) => x.state === 'paused' && x.resume());
    else r.recorder.forEach((x) => x.state === 'recording' && x.pause());
    setPausiert(!pausiert);
  }

  async function beenden() {
    const r = rec.current;
    if (!r) return;
    if (r.timer) window.clearInterval(r.timer);
    r.timer = null;
    await Promise.all(r.recorder.map((x) => new Promise<void>((ok) => {
      if (x.state === 'inactive') return ok();
      x.onstop = () => ok();
      x.stop();
    })));
    const bilder = r.standbilder?.stopp() ?? [];
    const dateien: Datei[] = [{ art: 'audio', blob: new Blob(r.chunks.audio, { type: r.mime.audio }), mime: r.mime.audio }];
    for (const b of bilder) dateien.push({ art: 'bild', blob: b.blob, mime: 'image/jpeg' });
    if (r.chunks.video.length) dateien.push({ art: 'video', blob: new Blob(r.chunks.video, { type: r.mime.video }), mime: r.mime.video });
    const dauer = r.sek;
    aufraeumen();
    await senden(dateien, dauer);
  }

  async function dateiGewaehlt(datei: File | undefined) {
    if (!datei) return;
    if (datei.size > MAX_DATEI_BYTES) return setMeldung('Die Datei ist größer als 500 MB.');
    setPhase('hochladen');
    setProzent(0);
    setMeldung('Tonspur wird vorbereitet …');
    try {
      const { teile, dauerSek } = await audioTeileAusDatei(datei);
      const dateien: Datei[] = teile.map((blob) => ({ art: 'audio' as const, blob, mime: 'audio/wav' }));
      if (datei.type.startsWith('video/')) {
        setMeldung('Standbilder werden erzeugt …');
        for (const blob of (await standbilderAusDatei(datei)).slice(0, MAX_BILDER)) dateien.push({ art: 'bild', blob, mime: 'image/jpeg' });
        dateien.push({ art: 'video', blob: datei, mime: datei.type });
      }
      await senden(dateien, dauerSek);
    } catch (err) {
      setMeldung((err as Error).message);
      setPhase('fehler');
    }
  }

  async function senden(dateien: Datei[], dauerSek: number) {
    setPhase('hochladen');
    setMeldung('Wird hochgeladen …');
    try {
      const audio = dateien.filter((d) => d.art === 'audio');
      const bilder = dateien.filter((d) => d.art === 'bild');
      const video = dateien.find((d) => d.art === 'video');
      if (!audio.length || audio.every((a) => a.blob.size < 1000)) throw new Error('Es wurde kein Ton aufgenommen – Mikrofon prüfen.');
      const res = await fetch('/api/akademie/aufnahmen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modus,
          titel: titel.trim() || 'SOP-Aufnahme',
          hinweis: hinweis.trim() || null,
          kontext,
          audioTeile: audio.length,
          bilder: bilder.length,
          video: video ? { mime: video.mime.split(';')[0], bytes: video.blob.size } : null,
          audioMime: audio[0]?.mime.split(';')[0] ?? null,
          dauerSek,
          groesseBytes: dateien.reduce((s, d) => s + d.blob.size, 0),
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { id?: string; uploads?: Array<{ art: 'audio' | 'bild' | 'video'; index: number; signedUrl: string }>; error?: string };
      if (!res.ok || !d.id || !d.uploads) throw new Error(d.error ?? 'Aufnahme konnte nicht angelegt werden');

      const gesamt = dateien.reduce((s, x) => s + x.blob.size, 0) || 1;
      const geladen: number[] = new Array(d.uploads.length).fill(0);
      const zuordnung = { audio: audio, bild: bilder, video: video ? [video] : [] };
      // nacheinander in kleinen Gruppen (große Videos blockieren nicht die Bilder)
      const auftraege = d.uploads.map((u, i) => async () => {
        const datei = zuordnung[u.art][u.index];
        if (!datei) return;
        await hochladen(u.signedUrl, datei.blob, datei.mime.split(';')[0], (n) => {
          geladen[i] = n;
          setProzent(Math.min(99, Math.round((geladen.reduce((a, b) => a + b, 0) / gesamt) * 100)));
        });
      });
      for (let i = 0; i < auftraege.length; i += 4) await Promise.all(auftraege.slice(i, i + 4).map((f) => f()));

      const fertig = await fetch(`/api/akademie/aufnahmen/${d.id}/fertig`, { method: 'POST' });
      if (!fertig.ok) throw new Error('Verarbeitung konnte nicht gestartet werden');
      setProzent(100);
      setPhase('fertig');
      setMeldung(null);
    } catch (err) {
      setMeldung((err as Error).message);
      setPhase('fehler');
    }
  }

  const bildschirmMoeglich = typeof window !== 'undefined' && kannBildschirmAufnehmen();

  return (
    <>
      {/* Während der Aufnahme: kleine Leiste, damit du weiter durch die Cloud klicken kannst */}
      {phase === 'aufnahme' ? (
        <div className="fx-shell fixed bottom-[calc(96px+env(safe-area-inset-bottom))] left-3 z-40 flex items-center gap-2 rounded-full bg-ink px-3 py-2 text-[14px] text-white shadow-lg md:bottom-6 md:left-6">
          <span className={`h-2.5 w-2.5 rounded-full ${pausiert ? 'bg-gray-400' : 'animate-pulse bg-red-500'}`} />
          <span className="tabular-nums">{zeitText(sek)} / {zeitText(MAX_DAUER_SEK)}</span>
          <button onClick={pauseUmschalten} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20" aria-label={pausiert ? 'Weiter' : 'Pause'}>
            {pausiert ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button onClick={() => beenden()} className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1.5 text-[13px] font-medium hover:bg-red-500">
            <Square className="h-3.5 w-3.5" /> Fertig
          </button>
        </div>
      ) : (
        <button
          onClick={oeffnen}
          title="SOP aufnehmen"
          className="fx-shell fixed bottom-[calc(96px+env(safe-area-inset-bottom))] left-3 z-40 inline-flex h-11 items-center gap-2 rounded-full bg-card px-3.5 text-[14px] font-medium text-gray-700 shadow-[0_12px_30px_-14px_#1a151466,inset_0_0_0_1px_#e8e1dc] hover:text-ink md:bottom-6 md:left-6"
        >
          <Clapperboard className="h-4 w-4 text-red-800" />
          <span className="hidden sm:inline">SOP aufnehmen</span>
        </button>
      )}

      <Modal open={phase !== 'zu' && phase !== 'aufnahme'} onClose={() => phase !== 'hochladen' && setPhase('zu')} title="SOP aufnehmen" width="max-w-xl">
        {phase === 'auswahl' && (
          <div className="space-y-4">
            <p className="text-[14.5px] text-gray-600">
              Erklär die Aufgabe einfach so, wie du sie einem neuen Mitarbeiter zeigen würdest. Die KI macht daraus eine SOP, prüft sie auf Lücken und stellt dir Rückfragen. Nichts wird ohne deine Freigabe sichtbar.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                { m: 'audio', icon: Mic, label: 'Nur Audio', text: 'Sprachnachricht' },
                { m: 'bildschirm', icon: MonitorUp, label: 'Bildschirm + Ton', text: bildschirmMoeglich ? 'Klickwege zeigen' : 'nur am Computer (Chrome/Edge/Firefox)' },
                { m: 'datei', icon: Upload, label: 'Datei hochladen', text: 'Audio oder Video' },
              ] as const).map(({ m, icon: Icon, label, text }) => (
                <button
                  key={m}
                  disabled={m === 'bildschirm' && !bildschirmMoeglich}
                  onClick={() => setModus(m)}
                  className={`rounded-[14px] p-3 text-left disabled:opacity-40 ${modus === m ? 'bg-red-50 shadow-[inset_0_0_0_1.5px_#7f1d1d]' : 'bg-panel'}`}
                >
                  <Icon className="h-5 w-5 text-red-800" />
                  <div className="mt-1.5 text-[14.5px] font-medium">{label}</div>
                  <div className="text-[12.5px] text-gray-500">{text}</div>
                </button>
              ))}
            </div>
            <label className="block text-[13px] font-medium text-gray-600">
              Titel
              <Input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Meta-Kampagne starten" className="mt-1" />
            </label>
            <label className="block text-[13px] font-medium text-gray-600">
              Hinweis für die KI (optional)
              <Input value={hinweis} onChange={(e) => setHinweis(e.target.value)} placeholder="z. B. für Setter, ergänzt die SOP „Close-Pflege“" className="mt-1" />
            </label>
            <p className="text-[12.5px] text-gray-500">Seite: {kontext.seitentitel} ({kontext.pfad}) · max. 20 Minuten</p>
            {meldung && <p className="text-[13.5px] text-red-800">{meldung}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button className={sekundaer} onClick={() => setPhase('zu')}>Abbrechen</button>
              {modus === 'datei' ? (
                <label className={`${primaer} cursor-pointer`}>
                  <Upload className="h-4 w-4" /> Datei wählen
                  <input type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => dateiGewaehlt(e.target.files?.[0])} />
                </label>
              ) : (
                <button className={primaer} onClick={starten}>
                  {modus === 'audio' ? <Mic className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />} Aufnahme starten
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'hochladen' && (
          <div className="space-y-3">
            <p className="text-[15px]">{meldung ?? 'Wird hochgeladen …'}</p>
            <div className="h-2 overflow-hidden rounded-full bg-panel">
              <div className="h-full bg-red-800 transition-all" style={{ width: `${prozent}%` }} />
            </div>
            <p className="text-[13px] text-gray-500">{prozent} % – bitte das Fenster offen lassen.</p>
          </div>
        )}

        {phase === 'fertig' && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-[15px] font-medium"><Check className="h-5 w-5 text-green-700" /> Aufnahme ist angekommen.</p>
            <p className="text-[14.5px] text-gray-600">
              Die KI erstellt jetzt den SOP-Entwurf und prüft ihn auf Lücken (meist 1–4 Minuten). Du bekommst eine Benachrichtigung – den Entwurf und offene Fragen findest du unter Verwaltung → Team-Akademie → „SOP aus Aufnahmen“.
            </p>
            <div className="flex justify-end gap-2">
              <a href="/admin/akademie?tab=sop" className={sekundaer}>Zu den Aufnahmen</a>
              <button className={primaer} onClick={() => setPhase('zu')}>Schließen</button>
            </div>
          </div>
        )}

        {phase === 'fehler' && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-[15px] font-medium text-red-800"><X className="h-5 w-5" /> Das hat nicht geklappt.</p>
            <p className="text-[14.5px] text-gray-700">{meldung}</p>
            <div className="flex justify-end gap-2">
              <button className={sekundaer} onClick={() => setPhase('zu')}>Schließen</button>
              <button className={primaer} onClick={() => setPhase('auswahl')}>Nochmal</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
