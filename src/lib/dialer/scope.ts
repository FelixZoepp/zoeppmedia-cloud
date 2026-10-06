import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentUser, getEffectiveAgencyId, isInternal, type CurrentUser } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { KUNDEN_CLOUD_BEREICHE } from '@/lib/team/funktionen';

/**
 * Für welche Kunden darf jemand im Anruf-Modus telefonieren?
 * - Kunde (owner/member/viewer): nur die eigene Agentur
 * - Intern in einer Kunden-Cloud (Impersonation): nur dieser Kunde
 * - Intern im internen Dialer: Admins + Innendienst alle Kunden, andere Mitarbeiter ihre zugeordneten
 */
export interface DialerScope {
  user: CurrentUser;
  /** null = alle Kunden */
  agencyIds: string[] | null;
  /** true = genau ein Kunde (Kunden-Cloud) */
  einKunde: boolean;
  /** darf Anrufe protokollieren */
  schreiben: boolean;
}

export async function dialerScope(svc: SupabaseClient, opts: { intern?: boolean } = {}): Promise<DialerScope | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  if (!isInternal(user.role)) {
    if (!user.agency_id) return null;
    return { user, agencyIds: [user.agency_id], einKunde: true, schreiben: canWriteRole(user.role) };
  }

  // Intern, in einer Kunden-Cloud eingeloggt → nur dieser Kunde (außer im internen Dialer)
  if (!opts.intern) {
    const effektiv = await getEffectiveAgencyId();
    if (effektiv && effektiv !== user.agency_id) return { user, agencyIds: [effektiv], einKunde: true, schreiben: true };
  }

  if (user.role === 'admin' || KUNDEN_CLOUD_BEREICHE.includes(user.funktion ?? '')) {
    return { user, agencyIds: null, einKunde: false, schreiben: true };
  }

  const { data } = await svc.from('employee_assignments').select('agency_id').eq('employee_id', user.id);
  return {
    user,
    agencyIds: ((data ?? []) as Array<{ agency_id: string }>).map((a) => a.agency_id),
    einKunde: false,
    schreiben: true,
  };
}

/** Darf der Scope diesen Kunden bearbeiten? */
export function imScope(scope: DialerScope, agencyId: string): boolean {
  return scope.agencyIds === null || scope.agencyIds.includes(agencyId);
}
