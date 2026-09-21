/**
 * 24h-Fensterlogik, Preflight-Checks und STOP-Erkennung.
 * Spec Abschn. 7: Nachrichtenregeln.
 */

export function isWindowOpen(windowExpiresAt: string | null): boolean {
  if (!windowExpiresAt) return false;
  return new Date(windowExpiresAt).getTime() > Date.now();
}

/**
 * Prüft ob gerade Ruhezeit ist (Standard 20:00–08:00 Ortszeit Mo–Sa, Sonntag ganztägig).
 * Verwendet Intl API — keine npm-Dependency.
 */
export function isQuietHours(timezone: string): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';

  // Sonntag = ganzer Tag Ruhezeit
  if (weekday === 'Sun') return true;

  // Mo–Sa: 08:00 bis 20:00 sind Geschäftszeiten
  return hour < 8 || hour >= 20;
}

const STOP_WORDS = new Set(['stop', 'stopp', 'abmelden']);

/**
 * Prüft ob eine eingehende Nachricht ein Opt-out (STOP) ist.
 * Case-insensitive, exakte Übereinstimmung (kein Teilstring).
 */
export function isStopMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  return STOP_WORDS.has(text.trim().toLowerCase());
}

export interface PreflightOpts {
  consentWhatsapp: boolean;
  windowExpiresAt: string | null;
  isTemplate: boolean;
  /** true wenn ein Recruiter die Nachricht manuell im UI sendet (Ruhezeiten-Ausnahme) */
  isHumanUiSend: boolean;
  timezone: string;
  accountConnected: boolean;
}

export interface PreflightResult {
  ok: boolean;
  reason?: string;
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
  // Ruhezeiten binden automatisierte Sends; manueller UI-Versand durch Recruiter ist ausgenommen
  if (!opts.isHumanUiSend && isQuietHours(opts.timezone)) {
    return { ok: false, reason: 'Ruhezeit (08:00–20:00 Mo–Sa) — automatischer Versand gesperrt' };
  }
  return { ok: true };
}
