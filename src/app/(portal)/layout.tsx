import { redirect } from 'next/navigation';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { agencyLogo } from '@/lib/branding/logo';
import { LayoutShell } from '@/components/layout-shell';
import { PushManager } from '@/components/push-manager';
import { ImpersonationBanner } from '@/components/impersonation-banner';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Kunden-Logo (agencies.settings.logo_url) für Sidebar und Topbar
  const agencyId = await getEffectiveAgencyId();
  const { data: agency } = agencyId
    ? await createAdminClient().from('agencies').select('settings').eq('id', agencyId).maybeSingle()
    : { data: null };

  return (
    <LayoutShell
      user={{ name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url ?? null, logo_url: agencyLogo(agency?.settings) }}
    >
      <ImpersonationBanner />
      {children}
      <PushManager />
    </LayoutShell>
  );
}
