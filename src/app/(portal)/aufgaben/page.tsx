import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PortalAufgabenClient } from './aufgaben-client';

export const dynamic = 'force-dynamic';

export default async function PortalAufgabenPage() {
  const user = await getCurrentUser();
  if (!user || !user.agency_id) redirect('/login');

  return <PortalAufgabenClient userId={user.id} />;
}
