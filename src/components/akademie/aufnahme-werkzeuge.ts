/**
 * Browser-Werkzeuge für „SOP aufnehmen“: Standbilder aus einem Bildschirm-Stream, Audio aus
 * hochgeladenen Dateien (16 kHz mono WAV in Teilen < 24 MB) und Uploads mit Fortschritt.
 */

export const MAX_DAUER_SEK = 20 * 60;
export const MAX_BILDER = 40;
export const MAX_DATEI_BYTES = 500 * 1024 * 1024;
const WAV_RATE = 16_000;
/** 10 Minuten 16 kHz mono 16 bit ≈ 19 MB – sicher unter Whispers 25 MB */
const WAV_TEIL_SEK = 10 * 60;

export interface Standbild {
  blob: Blob;
  zeit: number;
  wechsel: number;
}

/** Bevorzugter MediaRecorder-Typ, den der Browser kann */
export function waehleMime(kandidaten: string[]): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return kandidaten.find((m) => MediaRecorder.isTypeSupported(m));
}

export function kannBildschirmAufnehmen(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices;
}

/**
 * Zieht jede Sekunde ein Mini-Bild aus dem Video, speichert ein Standbild bei deutlichem Wechsel
 * (min. 2 s Abstand) oder spätestens alle 15 s. Mehr als MAX_BILDER → das mit dem kleinsten Wechsel fliegt raus.
 */
export function starteStandbilder(video: HTMLVideoElement, zeit: () => number): { stopp: () => Standbild[] } {
  const klein = document.createElement('canvas');
  klein.width = 32;
  klein.height = 18;
  const kctx = klein.getContext('2d', { willReadFrequently: true });
  const gross = document.createElement('canvas');
  let letztes: Uint8ClampedArray | null = null;
  let letzteZeit = -999;
  const bilder: Standbild[] = [];
  let laeuft = true;

  const pruefe = () => {
    if (!laeuft || !kctx || video.videoWidth === 0) return;
    kctx.drawImage(video, 0, 0, 32, 18);
    const px = kctx.getImageData(0, 0, 32, 18).data;
    let diff = 1;
    if (letztes) {
      let summe = 0;
      for (let i = 0; i < px.length; i += 4) summe += Math.abs(px[i] - letztes[i]) + Math.abs(px[i + 1] - letztes[i + 1]) + Math.abs(px[i + 2] - letztes[i + 2]);
      diff = summe / (px.length / 4) / (255 * 3);
    }
    const t = zeit();
    const deutlich = diff > 0.08 && t - letzteZeit >= 2;
    if (deutlich || t - letzteZeit >= 15) {
      letztes = new Uint8ClampedArray(px);
      letzteZeit = t;
      const breite = Math.min(1280, video.videoWidth);
      gross.width = breite;
      gross.height = Math.round((video.videoHeight / video.videoWidth) * breite);
      gross.getContext('2d')?.drawImage(video, 0, 0, gross.width, gross.height);
      gross.toBlob((blob) => {
        if (!blob) return;
        bilder.push({ blob, zeit: t, wechsel: deutlich ? diff : 0.01 });
        while (bilder.length > MAX_BILDER) {
          let min = 1;
          for (let i = 2; i < bilder.length; i++) if (bilder[i].wechsel < bilder[min].wechsel) min = i;
          bilder.splice(min, 1);
        }
      }, 'image/jpeg', 0.7);
    }
  };
  const timer = window.setInterval(pruefe, 1000);
  return {
    stopp: () => {
      laeuft = false;
      window.clearInterval(timer);
      return [...bilder].sort((a, b) => a.zeit - b.zeit);
    },
  };
}

/** Standbilder aus einer Video-Datei: gleichmäßig verteilt, höchstens MAX_BILDER, mind. 5 s Abstand */
export async function standbilderAusDatei(datei: File): Promise<Blob[]> {
  const url = URL.createObjectURL(datei);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise<void>((ok, fehler) => {
      video.onloadedmetadata = () => ok();
      video.onerror = () => fehler(new Error('Video lässt sich nicht lesen'));
    });
    const dauer = video.duration;
    if (!Number.isFinite(dauer) || dauer <= 0) return [];
    const schritt = Math.max(5, dauer / MAX_BILDER);
    const canvas = document.createElement('canvas');
    const breite = Math.min(1280, video.videoWidth || 1280);
    canvas.width = breite;
    canvas.height = Math.round(((video.videoHeight || 720) / (video.videoWidth || 1280)) * breite);
    const ctx = canvas.getContext('2d');
    const bilder: Blob[] = [];
    for (let t = Math.min(1, dauer / 2); t < dauer && bilder.length < MAX_BILDER; t += schritt) {
      video.currentTime = t;
      await new Promise<void>((ok) => { video.onseeked = () => ok(); });
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.7));
      if (blob) bilder.push(blob);
    }
    return bilder;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function wavAus(samples: Float32Array, rate: number): Blob {
  const puffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(puffer);
  const text = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([puffer], { type: 'audio/wav' });
}

/**
 * Tonspur einer Audio-/Videodatei → 16 kHz mono WAV in Teilen à höchstens 10 Minuten.
 * Läuft komplett im Browser – der Server braucht dafür kein ffmpeg.
 */
export async function audioTeileAusDatei(datei: File): Promise<{ teile: Blob[]; dauerSek: number }> {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  let decodiert: AudioBuffer;
  try {
    decodiert = await ctx.decodeAudioData(await datei.arrayBuffer());
  } catch {
    throw new Error('Die Tonspur dieser Datei kann dein Browser nicht lesen. Bitte als MP4, MP3, M4A, WAV oder WebM hochladen.');
  } finally {
    ctx.close().catch(() => {});
  }
  const dauerSek = Math.round(decodiert.duration);
  if (dauerSek > MAX_DAUER_SEK) throw new Error('Die Datei ist länger als 20 Minuten – bitte kürzen oder aufteilen.');
  const laenge = Math.ceil(decodiert.duration * WAV_RATE);
  const offline = new OfflineAudioContext(1, laenge, WAV_RATE);
  const quelle = offline.createBufferSource();
  quelle.buffer = decodiert;
  quelle.connect(offline.destination);
  quelle.start();
  const mono = (await offline.startRendering()).getChannelData(0);
  const teile: Blob[] = [];
  const proTeil = WAV_TEIL_SEK * WAV_RATE;
  for (let i = 0; i < mono.length; i += proTeil) teile.push(wavAus(mono.subarray(i, i + proTeil), WAV_RATE));
  return { teile, dauerSek };
}

/** PUT auf die signierte Supabase-Upload-URL mit Fortschritt (XHR, da fetch keinen Upload-Fortschritt kennt) */
export function hochladen(signedUrl: string, blob: Blob, contentType: string, fortschritt: (geladen: number) => void): Promise<void> {
  return new Promise((ok, fehler) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anon) xhr.setRequestHeader('apikey', anon);
    xhr.upload.onprogress = (e) => fortschritt(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? (fortschritt(blob.size), ok()) : fehler(new Error(`Upload fehlgeschlagen (${xhr.status}) ${xhr.responseText.slice(0, 160)}`)));
    xhr.onerror = () => fehler(new Error('Upload abgebrochen – Verbindung prüfen'));
    xhr.send(blob);
  });
}
