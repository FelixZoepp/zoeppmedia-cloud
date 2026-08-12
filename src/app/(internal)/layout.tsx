import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { AppSidebar } from '@/components/app-sidebar';

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isInternal(user.role)) redirect('/dashboard');

  return (
    <div className="flex h-screen bg-[var(--surface-app)]">
      <AppSidebar role={user.role} userName={user.name} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="px-12 py-10 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
