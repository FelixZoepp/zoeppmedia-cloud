import { getCurrentUser } from '@/lib/auth';
import { TeamClient } from './team-client';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const user = await getCurrentUser();
  return <TeamClient isAdmin={user?.role === 'admin'} />;
}
