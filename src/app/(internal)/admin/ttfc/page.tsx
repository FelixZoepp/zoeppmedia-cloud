import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { TtfcClient } from './ttfc-client';

export const dynamic = 'force-dynamic';

export default async function TtfcPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');

  return <TtfcClient />;
}
