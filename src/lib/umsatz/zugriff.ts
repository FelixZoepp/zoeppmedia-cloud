import { getCurrentUser } from '@/lib/auth';

/** Umsatz-Analyse sehen Admins, Vertriebsleitung und Buchhaltung. */
export async function darfUmsatz(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'employee' && ['vertrieb', 'backoffice'].includes(user.funktion ?? '');
}
