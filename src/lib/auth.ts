import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { IMPERSONATION_COOKIE } from '@/lib/recruiting/scope';

export type UserRole = 'admin' | 'employee' | 'agency_owner' | 'agency_member';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  agency_id: string | null;
}

// cache(): dedupes within one request (layout + page both call this)
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('users')
    .select('id, email, name, role, agency_id')
    .eq('id', user.id)
    .single();

  if (!data) return null;
  return data as CurrentUser;
});

export function isInternal(role: UserRole): boolean {
  return role === 'admin' || role === 'employee';
}

export function isAgency(role: UserRole): boolean {
  return role === 'agency_owner' || role === 'agency_member';
}

/**
 * Returns the effective agency ID for the current request.
 * - For admins with an active impersonation cookie: returns the cookie value.
 * - Otherwise: returns the user's own agency_id from the users table (may be null).
 */
export async function getEffectiveAgencyId(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  if (user.role === 'admin') {
    const cookieStore = await cookies();
    const impersonated = cookieStore.get(IMPERSONATION_COOKIE)?.value ?? null;
    if (impersonated) return impersonated;
  }

  return user.agency_id;
}
