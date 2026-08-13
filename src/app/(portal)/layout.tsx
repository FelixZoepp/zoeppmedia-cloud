import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AppSidebar } from '@/components/app-sidebar';
import { LayoutShell } from '@/components/layout-shell';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <LayoutShell sidebar={<AppSidebar role={user.role} userName={user.name} />}>
      {children}
    </LayoutShell>
  );
}
