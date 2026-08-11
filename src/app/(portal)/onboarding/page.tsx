import { getCurrentUser } from '@/lib/auth';
import { OnboardingClient } from './onboarding-client';

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  return <OnboardingClient agencyId={user?.agency_id ?? null} />;
}
