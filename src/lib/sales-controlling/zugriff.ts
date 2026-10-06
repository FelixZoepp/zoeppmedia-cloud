import { getCurrentUser } from '@/lib/auth';
import { SALES_BEREICHE } from '@/lib/team/funktionen';

/** Sales-Controlling sehen Admins und Mitarbeiter aus dem Sales (Vertriebsleitung, Setting, Closing). */
export async function darfSalesControlling(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'employee' && SALES_BEREICHE.includes(user.funktion ?? '');
}
