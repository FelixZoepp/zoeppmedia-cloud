import { createServerClient } from '@/lib/supabase/server';

export type UserRole = 'admin' | 'employee' | 'agency_owner' | 'agency_member';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  agency_id: string | null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
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
}

export function isInternal(role: UserRole): boolean {
  return role === 'admin' || role === 'employee';
}

export function isAgency(role: UserRole): boolean {
  return role === 'agency_owner' || role === 'agency_member';
}
