import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-64 bg-white border-r border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-6">Admin</h2>
        <nav className="space-y-2">
          <Link href="/admin" className="block px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 font-medium">
            Übersicht
          </Link>
          <Link href="/admin/invite" className="block px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 font-medium">
            Agentur einladen
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
