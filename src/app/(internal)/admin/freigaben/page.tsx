import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { FreigabenClient } from './freigaben-client';

export default async function FreigabenPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/aufgaben');

  return <FreigabenClient />;
}
