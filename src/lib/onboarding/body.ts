/**
 * Felder, die der Kunde im Onboarding-Formular nie selbst setzen darf.
 * Mandant, Status und Zeitstempel setzt ausschließlich der Server.
 */
const GESCHUETZTE_FELDER = new Set(['id', 'agency_id', 'status', 'created_at', 'updated_at', 'submitted_by']);

/** Entfernt geschützte und unplausible Schlüssel aus dem Request-Body des Onboarding-Formulars. */
export function bereinigeOnboardingBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const sauber: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (GESCHUETZTE_FELDER.has(key)) continue;
    if (!/^[a-z][a-z0-9_]*$/.test(key)) continue;
    sauber[key] = value;
  }
  return sauber;
}

/** Nur Rollen mit Schreibrecht dürfen das Onboarding ausfüllen (kein agency_viewer). */
export function darfOnboardingSchreiben(role: string | null | undefined): boolean {
  return role === 'agency_owner' || role === 'agency_member' || role === 'admin' || role === 'employee';
}
