/**
 * Kalendergrenzen in Europe/Berlin. Vercel rechnet in UTC – ohne diese Helfer landen Daten
 * zwischen 0 und 2 Uhr deutscher Zeit am falschen Tag bzw. in der falschen Woche.
 */

const TZ = 'Europe/Berlin';

const teileFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function wanduhr(d: Date) {
  const p = Object.fromEntries(teileFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), s: Number(p.second) };
}

/** Abstand Berlin − UTC in ms zum Zeitpunkt d (1 h im Winter, 2 h im Sommer) */
function offsetMs(d: Date): number {
  const w = wanduhr(d);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - Math.floor(d.getTime() / 1000) * 1000;
}

/** Zeitpunkt (UTC) von 00:00 Uhr Berliner Zeit am Kalendertag y-m-d (m 1-basiert, Überlauf erlaubt) */
export function berlinMitternacht(y: number, m: number, d: number): Date {
  const naiv = Date.UTC(y, m - 1, d);
  const erst = naiv - offsetMs(new Date(naiv));
  return new Date(naiv - offsetMs(new Date(erst)));
}

/** Heutiges Datum in Berlin als 'YYYY-MM-DD' */
export function berlinTag(jetzt: Date = new Date()): string {
  const w = wanduhr(jetzt);
  return `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}

/** Beginn des heutigen Tages (Berlin) als UTC-Zeitpunkt */
export function berlinTagesStart(jetzt: Date = new Date()): Date {
  const w = wanduhr(jetzt);
  return berlinMitternacht(w.y, w.m, w.d);
}

/** Montag 00:00 Uhr (Berlin) der laufenden Woche – auch sonntags die laufende, nicht die nächste Woche */
export function berlinWochenStart(jetzt: Date = new Date()): Date {
  const w = wanduhr(jetzt);
  const wochentag = new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay(); // 0 = Sonntag
  return berlinMitternacht(w.y, w.m, w.d - ((wochentag + 6) % 7));
}

/** Erster des Monats 00:00 Uhr (Berlin), delta in Monaten relativ zum aktuellen */
export function berlinMonatsStart(jetzt: Date = new Date(), delta = 0): Date {
  const w = wanduhr(jetzt);
  return berlinMitternacht(w.y, w.m + delta, 1);
}
