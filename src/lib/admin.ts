import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentUser, type CurrentUser } from '@/lib/auth';

/**
 * Rollen-Helfer für API-Routen. Laufen über getCurrentUser: Token lokal geprüft und deaktivierte Zugänge
 * (users.aktiv = false) zählen als nicht angemeldet. Der Parameter bleibt für bestehende Aufrufer.
 */
export async function isAdmin(_supabase?: SupabaseClient): Promise<boolean> {
  return (await getCurrentUser())?.role === 'admin';
}

export async function isInternalUser(_supabase?: SupabaseClient): Promise<boolean> {
  const role = (await getCurrentUser())?.role;
  return role === 'admin' || role === 'employee';
}

/** Werbekonten/Kampagnen live schalten: Admin oder Bereich „Ads & Funnel“ (media_buyer) */
export function darfWerbung(user: Pick<CurrentUser, 'role' | 'funktion'> | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'admin' || (user.role === 'employee' && user.funktion === 'media_buyer');
}
