import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { HealthClient } from './health-client';

export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');

  return <HealthClient />;
}
