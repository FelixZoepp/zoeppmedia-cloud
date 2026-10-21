import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { BilderClient } from './bilder-client';

export const dynamic = 'force-dynamic';

export default async function BilderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/login');
  const { id } = await params;
  return <BilderClient agencyId={id} />;
}
