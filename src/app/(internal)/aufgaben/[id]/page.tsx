import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { TaskDetailClient } from './task-detail-client';

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return <TaskDetailClient taskId={id} userRole={user.role} userId={user.id} />;
}
