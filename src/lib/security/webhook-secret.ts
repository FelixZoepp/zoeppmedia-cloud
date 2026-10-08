import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

/** Zeitkonstanter Vergleich eines mitgeschickten Shared Secrets. */
export function secretGleich(provided: string | null | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Antwort, wenn das Secret eines öffentlichen Webhooks nicht konfiguriert ist.
 * Fail-closed: ohne Secret wird nichts verarbeitet, statt jede Anfrage ungeprüft anzunehmen.
 */
export function secretFehlt(envName: string): NextResponse {
  console.error(`[webhook] ${envName} ist nicht gesetzt – Anfrage abgelehnt`);
  return NextResponse.json({ error: 'Webhook nicht konfiguriert' }, { status: 503 });
}
