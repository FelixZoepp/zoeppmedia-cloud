import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { getAdminDashboardData } from '@/lib/admin-dashboard';
import { AdminDashboardView } from '@/components/dashboard/admin-dashboard-view';
import { EmployeeDashboardView } from '@/components/dashboard/employee-dashboard-view';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/login');

  if (user.role === 'employee') {
    return <EmployeeDashboardView />;
  }

  const data = await getAdminDashboardData();

  return <AdminDashboardView data={data} />;
}
