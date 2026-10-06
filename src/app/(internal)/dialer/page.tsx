import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { DialerClient } from '@/components/dialer/dialer-client';

export const dynamic = 'force-dynamic';

export default async function DialerPage() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/login');

  return <DialerClient modus="intern" />;
}
