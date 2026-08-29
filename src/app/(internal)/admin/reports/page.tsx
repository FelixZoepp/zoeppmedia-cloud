import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ReportsClient } from './reports-client';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');

  return <ReportsClient />;
}
