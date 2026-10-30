import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { CashplanClient } from './cashplan-client';

export const dynamic = 'force-dynamic';

export default async function CashplanPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');
  return <CashplanClient />;
}
