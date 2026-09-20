import { getCurrentUser, isInternal } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PortalTaskDetailClient } from './task-detail-client';

export const dynamic = 'force-dynamic';

export default async function PortalTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isInternal(user.role) && !user.agency_id) redirect('/login');

  return <PortalTaskDetailClient taskId={id} userId={user.id} />;
}
