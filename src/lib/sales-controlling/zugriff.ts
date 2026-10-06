import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/** Sales-Controlling sehen Admins und Mitarbeiter mit der Funktion „vertrieb“ (Vertriebsleitung, Setter, Closer). */
export async function darfSalesControlling(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'employee') return false;
  const { data } = await createAdminClient().from('users').select('funktion').eq('id', user.id).maybeSingle();
  return (data as { funktion: string | null } | null)?.funktion === 'vertrieb';
}
