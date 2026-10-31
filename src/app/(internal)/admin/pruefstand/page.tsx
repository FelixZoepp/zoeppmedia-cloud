import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { PruefstandClient } from './pruefstand-client';

export const dynamic = 'force-dynamic';

export default async function PruefstandPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');
  return <PruefstandClient />;
}
