import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { FahrplanClient } from './fahrplan-client';

export default async function FahrplanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/login');

  return <FahrplanClient agencyId={id} />;
}
