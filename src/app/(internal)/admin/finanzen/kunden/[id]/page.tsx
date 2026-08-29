import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { KundenDetailClient } from './kunden-detail-client';

export const dynamic = 'force-dynamic';

export default async function FinanzenKundenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');

  return <KundenDetailClient agencyId={id} />;
}
