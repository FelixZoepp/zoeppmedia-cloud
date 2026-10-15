import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { ZeitenClient } from './zeiten-client';

export const dynamic = 'force-dynamic';

export default async function ZeitenPage() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/login');

  return <ZeitenClient istAdmin={user.role === 'admin'} />;
}
