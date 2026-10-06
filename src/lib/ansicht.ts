import { cookies } from 'next/headers';
import type { CurrentUser } from '@/lib/auth';

/**
 * Demo-Ansicht für Admins: die Cloud so sehen, wie sie ein Kunde oder ein Mitarbeiter eines Bereichs sieht
 * (Menü, Startseite, KI-Assistent). Die echten Rechte des Admins ändern sich dabei nicht.
 */
export const ANSICHT_COOKIE = 'zmc_ansicht';

export const ANSICHTEN = {
  kunde: { label: 'Kunde', funktion: null, start: '/dashboard' },
  fulfillment: { label: 'Fulfillment (Ads & Funnel)', funktion: 'media_buyer', start: '/meine-todos' },
  innendienst: { label: 'Innendienst', funktion: 'innendienst', start: '/innendienst' },
  csm: { label: 'Kundenberater', funktion: 'csm', start: '/ergebnisse' },
  vertrieb: { label: 'Vertriebsleitung', funktion: 'vertrieb', start: '/admin/vertrieb' },
  mitarbeiter: { label: 'Mitarbeiter (ohne Bereich)', funktion: null, start: '/meine-todos' },
} as const;

export type Ansicht = keyof typeof ANSICHTEN;

export function istAnsicht(v: unknown): v is Ansicht {
  return typeof v === 'string' && v in ANSICHTEN;
}

/** Aktive Demo-Ansicht – nur für echte Admins */
export async function aktiveAnsicht(user: Pick<CurrentUser, 'role'> | null): Promise<Ansicht | null> {
  if (user?.role !== 'admin') return null;
  const wert = (await cookies()).get(ANSICHT_COOKIE)?.value;
  return istAnsicht(wert) ? wert : null;
}
