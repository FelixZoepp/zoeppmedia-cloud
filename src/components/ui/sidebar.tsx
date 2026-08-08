'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, MoreHorizontal, X } from 'lucide-react';

export interface SidebarItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
  badge?: ReactNode;
}

export interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

interface SidebarProps {
  brand: string;
  brandLabel: string;
  brandSub?: string;
  userName?: string;
  groups: SidebarGroup[];
  bottomItems?: SidebarItem[];
  promo?: ReactNode;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Guten Morgen,';
  if (hour < 18) return 'Guten Nachmittag,';
  return 'Guten Abend,';
}

export function Sidebar({ brand, brandLabel, brandSub, userName, groups, bottomItems, promo }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  function isItemActive(item: SidebarItem) {
    return pathname === item.href || pathname.startsWith(item.href + '/');
  }

  function renderItem(item: SidebarItem, isCollapsed: boolean, onNavigate?: () => void) {
    const isActive = isItemActive(item);
    return (
      <Link
        key={item.id}
        href={item.href}
        onClick={onNavigate}
        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[var(--radius-pill)] text-[14px] font-medium transition-colors ${
          isActive
            ? 'bg-red-50 border border-red-200 text-red-600'
            : 'text-gray-900 hover:bg-gray-050 border border-transparent'
        } ${isCollapsed ? 'justify-center px-0' : ''}`}
        title={isCollapsed ? item.label : undefined}
      >
        <span className={`flex-shrink-0 ${isActive ? 'text-red-600' : 'text-gray-400'}`}>
          {item.icon}
        </span>
        {!isCollapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge}
          </>
        )}
      </Link>
    );
  }

  function renderBrand(isCollapsed: boolean) {
    return (
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-[36px] h-[36px] rounded-[var(--radius-sm)] bg-gradient-to-b from-[#EF5B6F] to-red-500 flex items-center justify-center text-white font-bold text-[15px] flex-shrink-0">
          {brand}
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <span className="text-[14px] font-bold text-gray-900 tracking-[0.05em] uppercase block truncate">
              {brandLabel}
            </span>
            {brandSub && (
              <span className="text-[11px] font-medium text-gray-400 tracking-[0.03em] uppercase block">
                {brandSub}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderNav(isCollapsed: boolean, onNavigate?: () => void) {
    return (
      <>
        <nav className="flex-1 flex flex-col px-3 py-2 overflow-y-auto">
          {groups.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? 'mt-6' : ''}>
              {!isCollapsed && (
                <div className="px-3.5 mb-2">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.08em]">
                    {group.label}
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => renderItem(item, isCollapsed, onNavigate))}
              </div>
            </div>
          ))}
        </nav>

        {promo && !isCollapsed && (
          <div className="px-3 pb-2">
            {promo}
          </div>
        )}

        {bottomItems && (
          <div className="flex flex-col gap-0.5 px-3 pb-2 border-t border-gray-100 pt-3">
            {bottomItems.map((item) => renderItem(item, isCollapsed, onNavigate))}
          </div>
        )}
      </>
    );
  }

  // First four nav items across all groups form the mobile tab bar; the
  // rest stays reachable through the "Mehr" drawer.
  const tabItems = groups.flatMap((g) => g.items).slice(0, 4);

  return (
    <>
      {/* Mobile Greeting Header */}
      <header className="flex lg:hidden items-center gap-3 px-5 pt-4 pb-2 bg-[var(--surface-app)] flex-shrink-0">
        <div className="w-[42px] h-[42px] rounded-full bg-gradient-to-b from-[#EF5B6F] to-red-500 flex items-center justify-center text-white font-bold text-[16px] flex-shrink-0">
          {brand}
        </div>
        <div className="min-w-0">
          <span suppressHydrationWarning className="text-[13px] text-gray-500 block leading-tight">
            {getGreeting()}
          </span>
          <span className="text-[17px] font-bold text-gray-900 block truncate leading-tight">
            {userName || brandLabel}
          </span>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar */}
      <div className="lg:hidden fixed z-40 left-1/2 -translate-x-1/2 bottom-[max(1rem,env(safe-area-inset-bottom))] w-[calc(100%-2rem)] max-w-[400px]">
        <nav className="flex items-center justify-between h-[64px] px-3 bg-white/95 backdrop-blur-md rounded-full border border-gray-100 shadow-[var(--shadow-lg)]">
          {tabItems.map((item) => {
            const isActive = isItemActive(item);
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-label={item.label}
                className={`flex items-center justify-center h-[46px] rounded-full transition-all ${
                  isActive
                    ? 'bg-red-50 text-red-600 px-6'
                    : 'text-gray-400 px-4'
                }`}
              >
                {item.icon}
              </Link>
            );
          })}
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Mehr"
            className={`flex items-center justify-center h-[46px] rounded-full transition-all cursor-pointer ${
              mobileOpen ? 'bg-red-50 text-red-600 px-6' : 'text-gray-400 px-4'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </nav>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-white flex flex-col shadow-[var(--shadow-lg)] animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-5 py-5">
              {renderBrand(false)}
              <button
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] text-gray-400 hover:bg-gray-050 hover:text-gray-600 transition-colors cursor-pointer flex-shrink-0"
                aria-label="Menü schließen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderNav(false, () => setMobileOpen(false))}
            <div className="pb-4" />
          </aside>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col flex-shrink-0 h-full bg-white border-r border-gray-100 transition-all ${
          collapsed ? 'w-[68px]' : 'w-[260px]'
        }`}
        style={{ transitionDuration: 'var(--dur-med)', transitionTimingFunction: 'var(--ease-out)' }}
      >
        <div className="px-5 py-5">
          {renderBrand(collapsed)}
        </div>

        {renderNav(collapsed)}

        <div className="px-3 pb-4 pt-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-full h-8 rounded-[var(--radius-md)] text-gray-400 hover:bg-gray-050 hover:text-gray-600 transition-colors cursor-pointer"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>
    </>
  );
}
