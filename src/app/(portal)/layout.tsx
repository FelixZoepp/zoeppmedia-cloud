import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AppSidebar } from '@/components/app-sidebar';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar role={user.role} userName={user.name} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
