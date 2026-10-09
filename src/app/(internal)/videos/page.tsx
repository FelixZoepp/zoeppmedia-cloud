import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { VideosClient } from './videos-client';

export const dynamic = 'force-dynamic';

export default async function VideosPage() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/');
  return <VideosClient />;
}
