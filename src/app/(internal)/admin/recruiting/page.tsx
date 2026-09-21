import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { RecruitingOverviewView } from '@/components/admin/recruiting-overview-view';

export const dynamic = 'force-dynamic';

export default async function AdminRecruitingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/admin');
  return <RecruitingOverviewView />;
}
