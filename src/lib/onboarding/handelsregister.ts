/**
 * Handelsregisterauszug im Onboarding: liegt privat im Bucket kunden-dokumente unter <agency_id>/handelsregister-….
 * Hochgeladen wird direkt in den Speicher (signierter Upload-Link, kein 4,5-MB-Limit der Funktion),
 * eingetragen in onboarding_submissions nur über /api/onboarding/handelsregister – nie über den Formular-Body.
 */

export const DOKUMENTE_BUCKET = 'kunden-dokumente';
export const MAX_GROESSE = 10 * 1024 * 1024;
const ENDUNG: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Dateityp und Größe prüfen (rein, testbar). null = in Ordnung, sonst Fehlertext */
export function pruefeDatei(mime: unknown, groesse: unknown): string | null {
  if (typeof mime !== 'string' || !ENDUNG[mime]) return 'Bitte als PDF, JPG oder PNG hochladen';
  if (typeof groesse !== 'number' || groesse <= 0) return 'Die Datei ist leer';
  if (groesse > MAX_GROESSE) return 'Die Datei ist zu groß (max. 10 MB)';
  return null;
}

/** Speicherpfad für einen neuen Auszug (rein, testbar) */
export function handelsregisterPfad(agencyId: string, mime: string, jetzt: Date = new Date()): string {
  return `${agencyId}/handelsregister-${jetzt.getTime()}.${ENDUNG[mime] ?? 'pdf'}`;
}

/** Gehört der Pfad zu diesem Kunden und ist es ein Handelsregister-Upload? (rein, testbar) */
export function istEigenerPfad(pfad: unknown, agencyId: string): pfad is string {
  return typeof pfad === 'string' && new RegExp(`^${agencyId}/handelsregister-\\d+\\.(pdf|jpg|png)$`).test(pfad);
}

/** Dateiname zur Anzeige kürzen und von Pfadteilen befreien (rein, testbar) */
export function anzeigeName(name: unknown): string {
  const n = typeof name === 'string' ? name.split(/[\\/]/).pop()!.trim() : '';
  return (n || 'Handelsregisterauszug').slice(0, 120);
}
