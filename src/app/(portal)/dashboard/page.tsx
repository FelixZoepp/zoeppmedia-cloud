import { redirect } from 'next/navigation';
import { getCurrentUser, getEffectiveAgencyId, isInternal } from '@/lib/auth';
import { getDashboardData } from '@/lib/dashboard';
import { createServerClient } from '@/lib/supabase/server';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeRoiUebersicht } from '@/lib/roi/laden';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // Kunde: eigene Agentur; Admin/Innendienst: die gerade geöffnete Kunden-Cloud
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) redirect(isInternal(user.role) ? '/innendienst' : '/login');

  const [data, supabase, roi] = await Promise.all([
    getDashboardData(agencyId),
    createServerClient(),
    ladeRoiUebersicht(createAdminClient(), agencyId).catch((err) => {
      console.error('[dashboard] Kennzahlen', err);
      return null;
    }),
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
      kennzahlen={
        roi && {
          ...roi.termine,
          einstellungen30: roi.einstellungen30,
          einstellungenGesamt: roi.einstellungenGesamt,
          letzterMonat: roi.roi.letzterMonat,
          umsatzLetzterMonat: roi.roi.umsatzLetzterMonat,
          wachstumProzent: roi.roi.wachstumProzent,
          roiLetzterMonat: roi.roi.roiLetzterMonat,
          roiKumuliert: roi.roi.roiKumuliert,
          umsatzVerlauf: roi.roi.monate.slice(0, -1).map((m) => m.umsatz),
          fehlend: roi.roi.fehlend,
        }
      }
    />
  );
}
