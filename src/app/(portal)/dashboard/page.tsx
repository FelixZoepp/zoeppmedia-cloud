import { redirect } from 'next/navigation';
import { getCurrentUser, getEffectiveAgencyId, isInternal } from '@/lib/auth';
import { getDashboardData } from '@/lib/dashboard';
import { createServerClient } from '@/lib/supabase/server';
import { DashboardView } from '@/components/dashboard/dashboard-view';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // Kunde: eigene Agentur; Admin/Innendienst: die gerade geöffnete Kunden-Cloud
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) redirect(isInternal(user.role) ? '/innendienst' : '/login');

  const [data, supabase] = await Promise.all([
    getDashboardData(agencyId),
    createServerClient(),
  ]);

  const { count: pendingSurveys } = await supabase
    .from('survey_schedule')
    .select('*', { count: 'exact', head: true })
    .eq('agency_id', agencyId)
    .is('completed_at', null);

  return (
    <DashboardView
      data={data}
      agencyId={agencyId}
      agencyName={user.name}
      pendingSurveys={pendingSurveys ?? 0}
    />
  );
}
