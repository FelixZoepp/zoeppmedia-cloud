import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { HeuteClient } from './heute-client';

export const dynamic = 'force-dynamic';

export default async function HeutePage() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/login');

  return <HeuteClient />;
}
