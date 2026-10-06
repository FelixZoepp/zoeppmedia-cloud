import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { darfKundenCloud } from '@/lib/kunden-cloud/zugriff';
import { InnendienstClient } from './innendienst-client';

export const dynamic = 'force-dynamic';

export default async function InnendienstPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!darfKundenCloud(user)) redirect('/meine-todos');
  return <InnendienstClient vorname={user.name.split(/\s+/)[0] ?? ''} />;
}
