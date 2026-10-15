/**
 * Zeiterfassung – öffentliche Schnittstelle.
 * Für die Marge je Kunde: `stundenProKunde(svc, 'YYYY-MM')` → [{ agencyId, minuten, kosten }].
 */
export * from './rechnen';
export { stundenProKunde, stundensatzLaden, eintraegeImMonat, tabelleFehlt, SCHEMA_FEHLT, STUNDENSATZ_KEY, type StundenProKunde } from './server';
