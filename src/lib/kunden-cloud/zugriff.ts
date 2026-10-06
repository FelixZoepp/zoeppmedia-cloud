import type { CurrentUser } from '@/lib/auth';
import { KUNDEN_CLOUD_BEREICHE } from '@/lib/team/funktionen';

/** Admins und Mitarbeiter aus Innendienst/Kundenbetreuung dürfen sich in Kunden-Clouds einloggen. */
export function darfKundenCloud(user: Pick<CurrentUser, 'role' | 'funktion'> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'employee' && KUNDEN_CLOUD_BEREICHE.includes(user.funktion ?? '');
}
