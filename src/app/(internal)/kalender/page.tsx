import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { KalenderClient } from './kalender-client';

export default async function KalenderPage() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/dashboard');
  return <KalenderClient meId={user.id} />;
}
