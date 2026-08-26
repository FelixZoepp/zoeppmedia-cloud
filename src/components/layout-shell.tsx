'use client';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';

export function LayoutShell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden md:block">{sidebar}</div>
      {/* Mobile sidebar overlay */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="fixed left-0 top-0 h-full z-50">{sidebar}</div>
        </div>
      )}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* Mobile header with hamburger */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white sticky top-0 z-40">
          <button onClick={() => setOpen(true)} className="p-2 rounded-lg hover:bg-gray-100">
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <span className="text-sm font-bold text-gray-900 uppercase flex-1">Zoepp Media</span>
          <NotificationBell />
        </div>
        {/* Desktop header */}
        <div className="hidden md:flex items-center justify-end px-8 py-3 border-b border-gray-200 bg-white sticky top-0 z-40">
          <NotificationBell />
        </div>
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
