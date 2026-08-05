import Link from 'next/link';
import { LogoutButton } from '@/components/logout-button';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-900">Zoepp Media Cloud</h2>
        <nav className="flex gap-4 items-center">
          <Link href="/dashboard" className="text-gray-700 hover:text-gray-900 font-medium text-sm">
            Pipeline
          </Link>
          <Link href="/settings" className="text-gray-700 hover:text-gray-900 font-medium text-sm">
            Einstellungen
          </Link>
          <LogoutButton />
        </nav>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
