import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { CockpitView } from '@/components/dashboard/cockpit-view';
import { EmployeeDashboardView } from '@/components/dashboard/employee-dashboard-view';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/login');

  if (user.role === 'employee') {
    return <EmployeeDashboardView />;
  }

  // Admin: Cockpit für das eine Steuerungs-Meeting pro Woche
  return <CockpitView />;
}
