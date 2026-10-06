import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { bausteineVon } from '@/lib/fulfillment/pakete';
import { OnboardingClient } from './onboarding-client';

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  const agencyId = user?.agency_id ?? null;
  let bausteine = bausteineVon(null);
  if (agencyId) {
    const { data } = await createAdminClient().from('agencies').select('bausteine').eq('id', agencyId).maybeSingle();
    bausteine = bausteineVon((data as { bausteine?: unknown } | null)?.bausteine);
  }
  return <OnboardingClient agencyId={agencyId} bausteine={bausteine} />;
}
