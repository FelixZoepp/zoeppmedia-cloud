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

  const supabase = await createServerClient();
  const [data, roi, { count: pendingSurveys }] = await Promise.all([
    getDashboardData(agencyId),
    ladeRoiUebersicht(createAdminClient(), agencyId).catch((err) => {
      console.error('[dashboard] Kennzahlen', err);
      return null;
    }),
    supabase
      .from('survey_schedule')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', agencyId)
      .is('completed_at', null),
  ]);
  const { data: g } = await createAdminClient()
    .from('agencies')
    .select('garantie_ampel, garantie_ist, garantie_ziel_starter')
    .eq('id', agencyId)
    .maybeSingle();
  const gz = g as { garantie_ampel: string | null; garantie_ist: number | null; garantie_ziel_starter: number | null } | null;

  return (
    <DashboardView
      data={data}
      agencyId={agencyId}
      agencyName={user.name}
      pendingSurveys={pendingSurveys ?? 0}
      garantie={gz?.garantie_ziel_starter && gz.garantie_ampel ? { ampel: gz.garantie_ampel, ist: gz.garantie_ist ?? 0, ziel: gz.garantie_ziel_starter } : null}
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
