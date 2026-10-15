import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ZeitenAdminClient } from './zeiten-admin-client';

export const dynamic = 'force-dynamic';

export default async function ZeitenAdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');

  return <ZeitenAdminClient />;
}
