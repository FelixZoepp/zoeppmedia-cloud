import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { LayoutShell } from '@/components/layout-shell';
import { PushManager } from '@/components/push-manager';
import { ImpersonationBanner } from '@/components/impersonation-banner';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <LayoutShell user={{ name: user.name, email: user.email, role: user.role }}>
      <ImpersonationBanner />
      {children}
      <PushManager />
    </LayoutShell>
  );
}
