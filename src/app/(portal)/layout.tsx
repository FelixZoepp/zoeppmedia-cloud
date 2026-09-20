import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AppSidebar } from '@/components/app-sidebar';
import { LayoutShell } from '@/components/layout-shell';
import { PushManager } from '@/components/push-manager';
import { ImpersonationBanner } from '@/components/impersonation-banner';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <LayoutShell sidebar={<AppSidebar role={user.role} userName={user.name} />}>
      <ImpersonationBanner />
      {children}
      <PushManager />
    </LayoutShell>
  );
}
