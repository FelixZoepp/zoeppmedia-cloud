import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AnzeigenClient } from './anzeigen-client';

export const dynamic = 'force-dynamic';

export default async function AnzeigenPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');
  return <AnzeigenClient />;
}
