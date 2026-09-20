import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { CallSetupClient } from './call-setup-client';

export const dynamic = 'force-dynamic';

export default async function CallSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/login');

  const { id } = await params;
  return <CallSetupClient agencyId={id} />;
}
