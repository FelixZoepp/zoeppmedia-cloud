import { getCurrentUser, isInternal } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { FreigabenClient } from './freigaben-client';

export default async function FreigabenPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isInternal(user.role)) redirect('/aufgaben');

  return <FreigabenClient />;
}
