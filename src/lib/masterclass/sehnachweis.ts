/**
 * Masterclass: Video erst abhaken, wenn es angeschaut wurde.
 * Beim Öffnen einer Lektion gibt der Server einen signierten Zeitstempel aus (Sehnachweis).
 * Beim Abhaken muss seit diesem Zeitstempel mindestens die Videodauer (abzüglich Toleranz) vergangen sein –
 * so lässt sich der Knopf auch nicht per direktem API-Aufruf vorzeitig setzen.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/** Anteil der Videodauer, der vergangen sein muss (Ladezeit, Rundung der Dauer in Minuten) */
export const SEH_TOLERANZ = 0.85;
const GUELTIG_MS = 30 * 24 * 60 * 60 * 1000;

function sign(data: string): string | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update(`mc-seh:${data}`).digest('base64url').slice(0, 22);
}

export function baueSehnachweis(lessonId: string, userId: string, jetzt: number = Date.now()): string | null {
  const data = `${lessonId}.${userId}.${jetzt}`;
  const sig = sign(data);
  return sig ? `${data}.${sig}` : null;
}

/** Zeitpunkt des Öffnens, wenn der Nachweis zu Lektion und Nutzer passt – sonst null */
export function pruefeSehnachweis(token: unknown, lessonId: string, userId: string, jetzt: number = Date.now()): number | null {
  if (typeof token !== 'string') return null;
  const teile = token.split('.');
  if (teile.length !== 4) return null;
  const [l, u, ts, sig] = teile;
  if (l !== lessonId || u !== userId || !/^\d{10,15}$/.test(ts)) return null;
  const erwartet = sign(`${l}.${u}.${ts}`);
  if (!erwartet || sig.length !== erwartet.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(erwartet))) return null;
  const geoeffnet = Number(ts);
  if (geoeffnet > jetzt + 60_000 || jetzt - geoeffnet > GUELTIG_MS) return null;
  return geoeffnet;
}

/** Mindest-Sekunden seit dem Öffnen: Dauer aus der Lektion, sonst die vom Player gemeldete (rein, testbar) */
export function mindestSekunden(durationMinutes: number | null, playerSekunden: unknown): number {
  const ausLektion = durationMinutes && durationMinutes > 0 ? durationMinutes * 60 : 0;
  const ausPlayer = typeof playerSekunden === 'number' && Number.isFinite(playerSekunden) ? Math.min(Math.max(playerSekunden, 0), 6 * 3600) : 0;
  return Math.floor((ausLektion || ausPlayer) * SEH_TOLERANZ);
}
