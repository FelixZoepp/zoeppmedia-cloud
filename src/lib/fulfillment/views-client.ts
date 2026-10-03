/** Kleine Helfer für Client-Komponenten (ohne Server-Imports). */
export function today(now: Date = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}
