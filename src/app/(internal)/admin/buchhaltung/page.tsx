import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { BuchhaltungClient } from './buchhaltung-client';

export const dynamic = 'force-dynamic';

export default async function BuchhaltungPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');

  return <BuchhaltungClient />;
}
