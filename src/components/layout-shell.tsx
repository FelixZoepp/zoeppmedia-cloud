'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { GlobalSearch } from '@/components/global-search';
import { AppSidebar, MobileTabBar } from '@/components/app-sidebar';
import { useBoardReveal } from '@/components/ui/motion';
import type { UserRole } from '@/lib/auth';

interface ShellUser {
  name: string;
  email: string;
  role: UserRole;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function LayoutShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  // Menü gilt nur für den Pfad, auf dem es geöffnet wurde → schließt bei Seitenwechsel
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);
  const boardRef = useRef<HTMLDivElement>(null);
  const internal = user.role === 'admin' || user.role === 'employee';

  useBoardReveal(boardRef, pathname);

  // Mobile: Scrollen sperren, solange das Menü offen ist
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <div className="mx-auto grid min-h-dvh max-w-[1680px] grid-cols-1 gap-3 p-2.5 pb-[calc(88px+env(safe-area-inset-bottom))] md:grid-cols-[252px_minmax(0,1fr)] md:gap-3.5 md:p-3.5">
      <a
        href="#inhalt"
        className="fixed left-4 top-3 z-[100] -translate-y-[160%] rounded-[10px] bg-red-950 px-4 py-2.5 text-red-50 focus:translate-y-0"
      >
        Zum Inhalt springen
      </a>

      {/* Desktop-Sidebar: schwebende Fläche */}
      <div className="sticky top-3.5 hidden h-[calc(100dvh-28px)] md:block">
        <AppSidebar role={user.role} userName={user.name} />
      </div>

      {/* Mobile-Sidebar */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-2.5 left-2.5 top-2.5">
            <AppSidebar role={user.role} userName={user.name} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="grid min-w-0 grid-rows-[auto_1fr] gap-3 md:gap-3.5">
        {/* Topbar */}
        <header className="fx-shell sticky top-2.5 z-40 flex items-center gap-2.5 rounded-2xl bg-panel px-3 py-3 shadow-[0_10px_30px_-20px_#1a151466] md:static md:gap-3.5 md:px-[18px] md:py-3.5 md:shadow-none">
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[12px] bg-gradient-to-b from-red-700 to-red-950 text-[16px] font-bold text-white md:hidden">
            Z
          </span>
          <span className="flex-1 text-[17px] font-semibold tracking-[-0.03em] md:hidden">Zoepp Cloud</span>
          {internal && <GlobalSearch />}
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            <Link
              href={internal ? '/profile' : '/settings'}
              className="flex items-center gap-3 rounded-full py-0.5 pl-0.5 pr-1.5 transition-colors hover:bg-gray-100"
            >
              <span className="grid h-[46px] w-[46px] flex-none place-items-center rounded-full bg-red-100 text-sm font-semibold tracking-[0.02em] text-red-900">
                {initials(user.name) || '?'}
              </span>
              <span className="hidden min-w-0 lg:grid">
                <span className="truncate text-[15px] font-medium text-ink">{user.name}</span>
                <span className="truncate text-[13px] text-gray-600">{user.email}</span>
              </span>
            </Link>
          </div>
        </header>

        {/* Inhalt als eigene Fläche */}
        <main id="inhalt" className="min-w-0 rounded-2xl bg-panel px-4 pb-6 pt-6 md:px-[22px] md:pb-[22px] md:pt-7">
          <div ref={boardRef} className="mx-auto max-w-[1400px]">
            {children}
          </div>
        </main>
      </div>
      <MobileTabBar role={user.role} pathname={pathname} onMore={() => setOpen(true)} />
    </div>
  );
}
