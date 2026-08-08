import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AppSidebar } from '@/components/app-sidebar';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="flex flex-col lg:flex-row h-dvh bg-[var(--surface-app)]">
      <AppSidebar role={user.role} userName={user.name} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-28 sm:px-6 sm:pt-6 lg:px-10 lg:pt-10 lg:pb-10">
          {children}
        </div>
      </main>
    </div>
  );
}
