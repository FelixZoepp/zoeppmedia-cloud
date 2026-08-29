import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { TranskriptClient } from './transkript-client';

export default async function TranskriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/login');

  return <TranskriptClient agencyId={id} userId={user.id} userName={user.name} />;
}
