'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Call, Device } from '@twilio/voice-sdk';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';

type Zustand = 'bereit' | 'verbindet' | 'klingelt' | 'aktiv' | 'beendet';

/**
 * Anrufen im Browser über Twilio. Erscheint nur, wenn Twilio eingerichtet und freigegeben ist
 * (vorher nur für Admins). Die Nummer wählt der Server aus der Datenbank, der Browser schickt nur die Bewerber-ID.
 */
export function BrowserAnruf({ candidateId, onEnde }: { candidateId: string; onEnde?: (sekunden: number) => void }) {
  const [verfuegbar, setVerfuegbar] = useState<boolean | null>(null);
  const [zustand, setZustand] = useState<Zustand>('bereit');
  const [aufnahme, setAufnahme] = useState(true);
  const [stumm, setStumm] = useState(false);
  const [sekunden, setSekunden] = useState(0);
  const [fehler, setFehler] = useState('');
  const device = useRef<Device | null>(null);
  const call = useRef<Call | null>(null);
  const start = useRef<number | null>(null);
  const onEndeRef = useRef(onEnde);
  onEndeRef.current = onEnde;

  useEffect(() => {
    let ab = false;
    fetch('/api/twilio/token', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { verfuegbar: false }))
      .then((d: { verfuegbar: boolean }) => !ab && setVerfuegbar(d.verfuegbar))
      .catch(() => !ab && setVerfuegbar(false));
    return () => {
      ab = true;
    };
  }, []);

  useEffect(() => () => {
    call.current?.disconnect();
    device.current?.destroy();
  }, []);

  useEffect(() => {
    if (zustand !== 'aktiv') return;
    const t = setInterval(() => start.current && setSekunden(Math.round((Date.now() - start.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [zustand]);

  const holeDevice = useCallback(async (): Promise<Device> => {
    const r = await fetch('/api/twilio/token', { cache: 'no-store' });
    const d = (await r.json()) as { verfuegbar: boolean; token?: string; grund?: string };
    if (!d.verfuegbar || !d.token) throw new Error(d.grund ?? 'Telefonieren nicht verfügbar');
    if (device.current) {
      device.current.updateToken(d.token);
      return device.current;
    }
    const { Device } = await import('@twilio/voice-sdk');
    const dev = new Device(d.token, { codecPreferences: ['opus', 'pcmu'] as Call.Codec[], closeProtection: 'Es läuft noch ein Anruf.' });
    dev.on('tokenWillExpire', async () => {
      const n = (await (await fetch('/api/twilio/token', { cache: 'no-store' })).json()) as { token?: string };
      if (n.token) dev.updateToken(n.token);
    });
    device.current = dev;
    return dev;
  }, []);

  const anrufen = useCallback(async () => {
    setFehler('');
    setSekunden(0);
    setStumm(false);
    start.current = null;
    setZustand('verbindet');
    try {
      const dev = await holeDevice();
      const c = await dev.connect({ params: { candidateId, aufnahme: aufnahme ? '1' : '0' } });
      call.current = c;
      c.on('ringing', () => setZustand('klingelt'));
      c.on('accept', () => {
        start.current = Date.now();
        setZustand('aktiv');
      });
      const ende = () => {
        const s = start.current ? Math.round((Date.now() - start.current) / 1000) : 0;
        setSekunden(s);
        setZustand('beendet');
        call.current = null;
        onEndeRef.current?.(s);
      };
      c.on('disconnect', ende);
      c.on('cancel', ende);
      c.on('reject', ende);
      c.on('error', (e: { message?: string }) => setFehler(e.message ?? 'Fehler beim Anruf'));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Anruf fehlgeschlagen');
      setZustand('bereit');
    }
  }, [aufnahme, candidateId, holeDevice]);

  if (!verfuegbar) return null;

  const laeuft = zustand === 'verbindet' || zustand === 'klingelt' || zustand === 'aktiv';
  const mmss = `${Math.floor(sekunden / 60)}:${String(sekunden % 60).padStart(2, '0')}`;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {laeuft ? (
        <>
          <button
            onClick={() => call.current?.disconnect()}
            className="inline-flex h-14 items-center gap-2.5 rounded-full bg-gradient-to-b from-red-600 to-red-700 px-6 text-[17px] font-semibold text-white"
          >
            <PhoneOff className="h-5 w-5" /> Auflegen
          </button>
          <button
            onClick={() => {
              const n = !stumm;
              call.current?.mute(n);
              setStumm(n);
            }}
            disabled={zustand !== 'aktiv'}
            className={`inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium ${stumm ? 'bg-amber-100 text-amber-900' : 'bg-panel text-gray-700'}`}
          >
            {stumm ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />} {stumm ? 'Stumm' : 'Mikro an'}
          </button>
          <span className="text-[14px] font-medium text-gray-700">
            {zustand === 'verbindet' ? 'Verbinde …' : zustand === 'klingelt' ? 'Klingelt …' : `${mmss}${aufnahme ? ' · 🔴 Aufnahme' : ''}`}
          </span>
        </>
      ) : (
        <>
          <button
            onClick={anrufen}
            className="inline-flex h-14 items-center gap-2.5 rounded-full bg-gradient-to-b from-green-600 to-green-700 px-6 text-[17px] font-semibold text-white shadow-[0_12px_28px_-14px_#15803d] transition-transform hover:-translate-y-0.5"
          >
            <Phone className="h-5 w-5" /> Im Browser anrufen
          </button>
          <label className="inline-flex items-center gap-2 text-[13.5px] text-gray-700">
            <input type="checkbox" checked={aufnahme} onChange={(e) => setAufnahme(e.target.checked)} /> Aufnehmen (mit Ansage)
          </label>
          {zustand === 'beendet' && <span className="text-[13px] text-gray-500">Beendet nach {mmss}{aufnahme && sekunden > 0 ? ' · Aufnahme wird ausgewertet' : ''}</span>}
        </>
      )}
      {fehler && <p className="w-full text-[13px] text-red-700">{fehler}</p>}
    </div>
  );
}
