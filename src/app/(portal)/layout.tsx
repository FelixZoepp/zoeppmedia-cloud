import { redirect } from 'next/navigation';
import { getCurrentUser, getEffectiveAgencyId, isAgency } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { agencyLogo } from '@/lib/branding/logo';
import { LayoutShell } from '@/components/layout-shell';
import { PushManager } from '@/components/push-manager';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';
import { aktiveAnsicht } from '@/lib/ansicht';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Kunden-Logo (agencies.settings.logo_url) für Sidebar und Topbar
  const agencyId = await getEffectiveAgencyId();
  const { data: agency } = agencyId
    ? await createAdminClient().from('agencies').select('name, settings').eq('id', agencyId).maybeSingle()
    : { data: null };
  // Intern eingeloggt in eine Kunden-Cloud → Menü und Logo des Kunden zeigen
  const ansicht = await aktiveAnsicht(user);
  const inKundenCloud = (user.role === 'admin' || user.role === 'employee') && !!agencyId && agencyId !== user.agency_id && agencyId !== SALES_AGENCY_ID;

  return (
    <LayoutShell
      user={{
        name: user.name,
        email: user.email,
        // Demo-Ansicht „Kunde“: genau wie der Kunde (Menü, Dashboard, KI)
        role: ansicht === 'kunde' ? 'agency_owner' : user.role,
        istAdmin: user.role === 'admin',
        vorschau: ansicht === 'kunde' ? `Kunde ${agency?.name ?? ''}`.trim() : null,
        avatar_url: user.avatar_url ?? null,
        logo_url: agencyLogo(agency?.settings),
        // Marke der Cloud: Firmenname des Kunden (auch für den Kunden selbst, nicht sein Personenname)
        kunde: inKundenCloud || isAgency(user.role) ? (agency?.name ?? null) : null,
      }}
    >
      {ansicht !== 'kunde' && <ImpersonationBanner />}
      {children}
      <PushManager />
    </LayoutShell>
  );
}
