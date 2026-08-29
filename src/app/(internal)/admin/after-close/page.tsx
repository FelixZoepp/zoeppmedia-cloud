import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AfterCloseForm } from './after-close-form';

export const dynamic = 'force-dynamic';

export default async function AfterClosePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');

  return <AfterCloseForm />;
}
