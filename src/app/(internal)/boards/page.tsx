import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { BoardsClient } from './boards-client';

export const dynamic = 'force-dynamic';

export default async function BoardsPage() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/');
  return <BoardsClient />;
}
