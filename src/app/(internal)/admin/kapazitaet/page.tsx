import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { KapazitaetClient } from './kapazitaet-client';

export const dynamic = 'force-dynamic';

export default async function KapazitaetPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');

  return <KapazitaetClient />;
}
