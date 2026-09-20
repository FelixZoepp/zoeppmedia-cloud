import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { IMPERSONATION_COOKIE } from '@/lib/recruiting/scope';
import { ImpersonationBannerClient } from './impersonation-banner-client';

/**
 * Server Component: renders only when an admin has an active impersonation cookie.
 * Fetches the agency name from the DB and passes it to the client sub-component.
 */
export async function ImpersonationBanner() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return null;

  const cookieStore = await cookies();
  const agencyId = cookieStore.get(IMPERSONATION_COOKIE)?.value ?? null;
  if (!agencyId) return null;

  const admin = createAdminClient();
  const { data: agency } = await admin
    .from('agencies')
    .select('name')
    .eq('id', agencyId)
    .single();

  const agencyName = agency?.name ?? agencyId;

  return <ImpersonationBannerClient agencyName={agencyName} />;
}
