import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { FreigabenClient } from './freigaben-client';

export const dynamic = 'force-dynamic';

export default async function FreigabenPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');
  return <FreigabenClient />;
}
