import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { KundenClient } from './kunden-client';

export const dynamic = 'force-dynamic';

export default async function KundenPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');

  return <KundenClient />;
}
