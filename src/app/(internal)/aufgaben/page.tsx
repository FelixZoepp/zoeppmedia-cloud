import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AufgabenClient } from './aufgaben-client';

export default async function AufgabenPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return <AufgabenClient userRole={user.role} userId={user.id} />;
}
