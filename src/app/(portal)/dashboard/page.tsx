import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getDashboardData } from '@/lib/dashboard';
import { createServerClient } from '@/lib/supabase/server';
import { DashboardView } from '@/components/dashboard/dashboard-view';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user || !user.agency_id) redirect('/login');

  const [data, supabase] = await Promise.all([
    getDashboardData(user.agency_id),
    createServerClient(),
  ]);

  const { count: pendingSurveys } = await supabase
    .from('survey_schedule')
    .select('*', { count: 'exact', head: true })
    .eq('agency_id', user.agency_id)
    .is('completed_at', null);

  return (
    <DashboardView
      data={data}
      agencyName={user.name}
      pendingSurveys={pendingSurveys ?? 0}
    />
  );
}
