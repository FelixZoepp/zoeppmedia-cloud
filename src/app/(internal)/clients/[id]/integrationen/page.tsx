import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { IntegrationenClient } from './integrationen-client';

export const dynamic = 'force-dynamic';

export default async function IntegrationenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/login');

  const { id } = await params;
  return <IntegrationenClient agencyId={id} />;
}
