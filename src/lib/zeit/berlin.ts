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

// ---------------------------------------------------------------------------
// Kalendertage 'YYYY-MM-DD' (reine Datumsrechnung, ohne Uhrzeit)
// ---------------------------------------------------------------------------

const TAG_MUSTER = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Zerlegt 'YYYY-MM-DD' – null, wenn das Format falsch oder der Tag ungültig ist (z. B. 31.02.) */
export function tagTeile(tag: string): { y: number; m: number; d: number } | null {
  const t = TAG_MUSTER.exec(tag);
  if (!t) return null;
  const y = Number(t[1]);
  const m = Number(t[2]);
  const d = Number(t[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** true, wenn 'YYYY-MM-DD' ein gültiger Kalendertag ist */
export function istGueltigerTag(tag: string): boolean {
  return tagTeile(tag) !== null;
}

function tagAusUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Kalendertag um n Tage verschieben (n darf negativ sein) */
export function tagPlus(tag: string, n: number): string {
  const t = tagTeile(tag);
  if (!t) throw new Error(`Ungültiger Tag: ${tag}`);
  return tagAusUtc(Date.UTC(t.y, t.m - 1, t.d + n));
}

/** Anzahl Kalendertage von 'von' bis 'bis' einschließlich beider Tage (bis < von ergibt ≤ 0) */
export function tageInklusive(von: string, bis: string): number {
  const a = tagTeile(von);
  const b = tagTeile(bis);
  if (!a || !b) throw new Error(`Ungültiger Zeitraum: ${von} – ${bis}`);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000) + 1;
}

/**
 * Berliner Kalendertage → UTC-Zeitstempel für Datenbankabfragen:
 * ab = 00:00:00.000 Uhr Berlin am Tag 'von', bis = 23:59:59.999 Uhr Berlin am Tag 'bis'.
 * Sommer-/Winterzeit wird berücksichtigt (Umstellungstage haben 23 bzw. 25 Stunden).
 */
export function berlinTagesGrenzen(von: string, bis: string): { ab: string; bis: string } {
  const a = tagTeile(von);
  const b = tagTeile(bis);
  if (!a || !b) throw new Error(`Ungültiger Zeitraum: ${von} – ${bis}`);
  const start = berlinMitternacht(a.y, a.m, a.d);
  const ende = new Date(berlinMitternacht(b.y, b.m, b.d + 1).getTime() - 1);
  return { ab: start.toISOString(), bis: ende.toISOString() };
}

/**
 * Vorperiode: Beginnt der Zeitraum am Monatsersten und endet im selben Monat, ist es der Vormonat
 * (ganzer Monat → ganzer Vormonat, 1.–15. → 1.–15. des Vormonats). Sonst gleich viele Kalendertage direkt vor 'von'.
 */
export function vorperiode(von: string, bis: string): { from: string; to: string } {
  if (von.endsWith('-01') && von.slice(0, 7) === bis.slice(0, 7)) {
    const vormonatEnde = tagPlus(von, -1);
    const vormonatStart = `${vormonatEnde.slice(0, 7)}-01`;
    const ganzerMonat = tagPlus(bis, 1).endsWith('-01');
    const bisTag = Math.min(Number(bis.slice(8, 10)), Number(vormonatEnde.slice(8, 10)));
    return { from: vormonatStart, to: ganzerMonat ? vormonatEnde : `${vormonatEnde.slice(0, 7)}-${String(bisTag).padStart(2, '0')}` };
  }
  const n = tageInklusive(von, bis);
  return { from: tagPlus(von, -n), to: tagPlus(von, -1) };
}

/** Berliner Kalendertag eines Zeitstempels (ISO-String) als 'YYYY-MM-DD' */
export function berlinTagVon(iso: string): string {
  return berlinTag(new Date(iso));
}
