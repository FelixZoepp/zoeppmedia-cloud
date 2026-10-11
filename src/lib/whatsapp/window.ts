/**
 * 24h-Fensterlogik, Preflight-Checks und STOP-Erkennung.
 * Spec Abschn. 7: Nachrichtenregeln.
 */

export function isWindowOpen(windowExpiresAt: string | null): boolean {
  if (!windowExpiresAt) return false;
  return new Date(windowExpiresAt).getTime() > Date.now();
}

/**
 * Interner Hilfsfunktion: Ruhezeit-Prüfung für einen bestimmten Zeitpunkt.
 */
function isQuietHoursAt(date: Date, timezone: string): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';

  // Sonntag = ganzer Tag Ruhezeit
  if (weekday === 'Sun') return true;

  // Mo–Sa: 08:00 bis 20:00 sind Geschäftszeiten
  return hour < 8 || hour >= 20;
}

/**
 * Prüft ob gerade Ruhezeit ist (Standard 20:00–08:00 Ortszeit Mo–Sa, Sonntag ganztägig).
 * Verwendet Intl API — keine npm-Dependency.
 */
export function isQuietHours(timezone: string): boolean {
  return isQuietHoursAt(new Date(), timezone);
}

/**
 * Nächster erlaubter Versandzeitpunkt: Mo-Sa ab 08:00 Ortszeit.
 * Liegt now in Geschäftszeit -> now zurück. Sonst nächster Werktag 08:00.
 */
export function nextAllowedTime(now: Date, timezone: string): Date {
  if (!isQuietHoursAt(now, timezone)) return now;

  // Iteriere tageweise bis Geschäftszeit gefunden (max 7 Tage)
  let candidate = new Date(now.getTime());
  for (let i = 0; i < 7; i++) {
    if (i > 0) {
      candidate = new Date(candidate.getTime() + 24 * 60 * 60_000);
    }

    const weekdayParts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'short',
    }).formatToParts(candidate);
    const weekday = weekdayParts.find(p => p.type === 'weekday')?.value || '';

    // Sonntag überspringen
    if (weekday === 'Sun') continue;

    // Datum in Ortszeit bestimmen
    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(candidate);

    // UTC-Offset ermitteln: wir nutzen 12:00 UTC als Referenzpunkt
    const ref = new Date(`${dateParts}T12:00:00Z`);
    const localHour = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false })
        .formatToParts(ref).find(p => p.type === 'hour')?.value || '0', 10,
    );
    const utcHour = ref.getUTCHours(); // == 12
    const offsetHours = localHour - utcHour; // z.B. CEST = +2

    // 08:00 Ortszeit in UTC umrechnen
    const target = new Date(`${dateParts}T08:00:00Z`);
    target.setTime(target.getTime() - offsetHours * 3600_000);

    // Prüfe ob target in Zukunft liegt (bei i==0 kann es noch heute abend sein)
    if (target.getTime() > now.getTime()) {
      // Doppelcheck: Wochentag am Zieldatum (Umrechnung kann Tageswechsel bewirken)
      const targetWeekday = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone, weekday: 'short',
      }).format(target);
      if (targetWeekday !== 'Sun') return target;
    }
  }
  return now; // Fallback (sollte nie eintreten)
}

/**
 * Gesprächszeiten für den KI-Agenten (erste Nachricht nach einer Bewerbung, Antworten im laufenden Gespräch):
 * täglich 08:00–21:00 Ortszeit, auch am Wochenende – viele bewerben sich abends oder sonntags.
 */
export function isGespraechsRuhezeitAt(date: Date, timezone: string): boolean {
  const hour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).formatToParts(date).find((p) => p.type === 'hour')?.value || '0', 10) % 24;
  return hour < 8 || hour >= 21;
}

/** Nächster Zeitpunkt innerhalb der Gesprächszeiten (heute bzw. morgen 08:00 Ortszeit) */
export function naechsteGespraechszeit(now: Date, timezone: string): Date {
  if (!isGespraechsRuhezeitAt(now, timezone)) return now;
  let t = new Date(Math.ceil(now.getTime() / 900_000) * 900_000);
  for (let i = 0; i < 4 * 24; i++) {
    if (!isGespraechsRuhezeitAt(t, timezone)) return t;
    t = new Date(t.getTime() + 900_000);
  }
  return t;
}

const STOP_WORDS = new Set(['stop', 'stopp', 'abmelden', 'abbestellen', 'austragen', 'unsubscribe']);
/** Längere Abmelde-Formulierungen (Teilstring) */
const STOP_SAETZE = ['keine nachrichten mehr', 'nicht mehr schreiben', 'nicht mehr anschreiben', 'schreib mir nicht mehr', 'schreibt mir nicht mehr', 'lasst mich in ruhe'];

/**
 * Prüft ob eine eingehende Nachricht ein Opt-out (STOP) ist.
 * Case-insensitive, exakte Übereinstimmung (kein Teilstring).
 */
export function isStopMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase().replace(/[.!]+$/, '');
  if (STOP_WORDS.has(t)) return true;
  // Sätze nur bei kurzen, eindeutigen Nachrichten – „kann heute nicht mehr schreiben“ ist keine Abmeldung
  if (t.length > 60 || /\b(heute|morgen|gerade|später|spaeter|gleich|jetzt)\b/.test(t)) return false;
  return STOP_SAETZE.some((s) => t.includes(s));
}

export interface PreflightOpts {
  consentWhatsapp: boolean;
  windowExpiresAt: string | null;
  isTemplate: boolean;
  /** true wenn ein Recruiter die Nachricht manuell im UI sendet (Ruhezeiten-Ausnahme) */
  isHumanUiSend: boolean;
  timezone: string;
  accountConnected: boolean;
  /** true => Ruhezeiten-Check wird übersprungen (P4-R6: reminder_2h) */
  bypassQuietHours?: boolean;
  /** true => Gesprächszeiten des KI-Agenten (täglich 8–21 Uhr) statt der strengen Ruhezeiten */
  gespraechsZeiten?: boolean;
}

export interface PreflightResult {
  ok: boolean;
  reason?: string;
  /** true wenn nur die Ruhezeit den Versand blockiert — Aufrufer sollen verschieben statt aufgeben */
  quietHours?: boolean;
  naechsteZeit?: Date;
}

/**
 * Versand nur wegen Ruhezeit gesperrt. Der Tick verschiebt den Job auf nextAllowedTime,
 * statt ihn als Fehler zu werten (sonst nach ~81 Minuten Retries "dead").
 */
export class QuietHoursError extends Error {
  /** Nächster erlaubter Zeitpunkt (bei Gesprächszeiten), sonst rechnet der Tick nextAllowedTime */
  naechsteZeit?: Date;
  constructor(message: string, naechsteZeit?: Date) {
    super(message);
    this.name = 'QuietHoursError';
    this.naechsteZeit = naechsteZeit;
  }
}

/**
 * Preflight-Prüfung vor jedem Versand. Spec Abschn. 7.
 * Reihenfolge: Account -> Consent -> Fenster/Vorlage -> Ruhezeiten.
 */
export function checkPreflight(opts: PreflightOpts): PreflightResult {
  if (!opts.accountConnected) {
    return { ok: false, reason: 'WhatsApp-Konto nicht verbunden' };
  }
  if (!opts.consentWhatsapp) {
    return { ok: false, reason: 'Keine WhatsApp-Einwilligung vorhanden' };
  }
  if (!opts.isTemplate && !isWindowOpen(opts.windowExpiresAt)) {
    return { ok: false, reason: '24-Stunden-Fenster geschlossen — nur Vorlagen erlaubt' };
  }
  // Ruhezeiten binden automatisierte Sends; manueller UI-Versand und bypassQuietHours sind ausgenommen
  if (!opts.isHumanUiSend && !opts.bypassQuietHours && opts.gespraechsZeiten) {
    if (isGespraechsRuhezeitAt(new Date(), opts.timezone)) {
      return { ok: false, reason: 'Außerhalb der Gesprächszeiten (21:00–08:00) — automatischer Versand gesperrt', quietHours: true, naechsteZeit: naechsteGespraechszeit(new Date(), opts.timezone) };
    }
    return { ok: true };
  }
  if (!opts.isHumanUiSend && !opts.bypassQuietHours && isQuietHours(opts.timezone)) {
    return { ok: false, reason: 'Ruhezeit (20:00–08:00 Mo–Sa, So ganztägig) — automatischer Versand gesperrt', quietHours: true };
  }
  return { ok: true };
}
