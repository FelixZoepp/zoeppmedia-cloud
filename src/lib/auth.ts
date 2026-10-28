import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { IMPERSONATION_COOKIE } from '@/lib/recruiting/scope';
import { KUNDEN_CLOUD_BEREICHE } from '@/lib/team/funktionen';

export type UserRole = 'admin' | 'employee' | 'agency_owner' | 'agency_member' | 'agency_viewer';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  agency_id: string | null;
  avatar_url?: string | null;
  /** Bereich intern (users.funktion), z. B. 'vertrieb' */
  funktion?: string | null;
}

// cache(): dedupes within one request (layout + page both call this)
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createServerClient();
  // getClaims prüft das JWT lokal (asymmetrischer Schlüssel, JWKS gecacht) – kein Netzwerkaufruf zum Auth-Server.
  // Gesperrte/deaktivierte Zugänge fängt users.aktiv unten ab.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from('users')
    .select('id, email, name, role, agency_id, avatar_url, funktion, aktiv')
    .eq('id', userId)
    .single();

  if (!data) return null;
  // Deaktivierte Zugänge (users.aktiv = false) gelten als nicht angemeldet
  const { aktiv, ...rest } = data as CurrentUser & { aktiv: boolean | null };
  if (aktiv === false) return null;
  return rest as CurrentUser;
});

export function isInternal(role: UserRole): boolean {
  return role === 'admin' || role === 'employee';
}

export function isAgency(role: UserRole): boolean {
  return role === 'agency_owner' || role === 'agency_member' || role === 'agency_viewer';
}

/**
 * Returns the effective agency ID for the current request.
 * - For admins/Innendienst with an active impersonation cookie: returns the cookie value.
 * - Otherwise: returns the user's own agency_id from the users table (may be null).
 */
export async function getEffectiveAgencyId(bekannt?: CurrentUser | null): Promise<string | null> {
  // Schon geladenen Nutzer übergeben spart in API-Routen (dort wirkt cache() nicht) eine zweite Abfrage
  const user = bekannt === undefined ? await getCurrentUser() : bekannt;
  if (!user) return null;

  // Admins und Innendienst (1-Klick-Login in die Kunden-Cloud)
  if (user.role === 'admin' || (user.role === 'employee' && KUNDEN_CLOUD_BEREICHE.includes(user.funktion ?? ''))) {
    const cookieStore = await cookies();
    const impersonated = cookieStore.get(IMPERSONATION_COOKIE)?.value ?? null;
    if (impersonated) return impersonated;
  }

  return user.agency_id;
}
