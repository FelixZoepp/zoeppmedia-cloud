import { NextResponse } from 'next/server';
import { isInternal, type CurrentUser } from '@/lib/auth';
import { requireAgencyScope } from '@/lib/recruiting/agency-scope';

export const KUNDEN_ROLLEN = ['agency_owner', 'agency_member', 'agency_viewer'] as const;
export type KundenRolle = (typeof KUNDEN_ROLLEN)[number];

export const ROLLEN_LABEL: Record<KundenRolle, string> = {
  agency_owner: 'Inhaber',
  agency_member: 'Mitarbeiter',
  agency_viewer: 'Nur lesen',
};

/** Team der Kunden-Cloud verwalten dürfen: Inhaber der Agentur und interne Nutzer (Admin/Innendienst) */
export function darfTeamVerwalten(user: Pick<CurrentUser, 'role'>): boolean {
  return user.role === 'agency_owner' || isInternal(user.role);
}

/** Welche Rollen darf dieser Nutzer vergeben? Inhaber nur Mitarbeiter/Lesen, intern auch weitere Inhaber. */
export function vergebbareRollen(user: Pick<CurrentUser, 'role'>): KundenRolle[] {
  return isInternal(user.role) ? [...KUNDEN_ROLLEN] : ['agency_member', 'agency_viewer'];
}

export async function requireTeamScope(verwalten: boolean) {
  const scope = await requireAgencyScope();
  if (scope instanceof NextResponse) return scope;
  if (verwalten && !darfTeamVerwalten(scope.user)) {
    return NextResponse.json({ error: 'Nur der Inhaber kann das Team verwalten.' }, { status: 403 });
  }
  return scope;
}
