import { getCurrentUser, isInternal, type CurrentUser } from '@/lib/auth';

/** Boards sind für alle internen Nutzer (Admin + Mitarbeiter) */
export async function internerNutzer(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user && isInternal(user.role) ? user : null;
}
