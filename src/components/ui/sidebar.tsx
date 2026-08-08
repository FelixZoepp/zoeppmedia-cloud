'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';

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
  groups: SidebarGroup[];
  bottomItems?: SidebarItem[];
  promo?: ReactNode;
}

export function Sidebar({ brand, brandLabel, brandSub, groups, bottomItems, promo }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  function renderItem(item: SidebarItem, isCollapsed: boolean, onNavigate?: () => void) {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
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

  return (
    <>
      {/* Mobile Top Bar */}
      <header className="flex lg:hidden items-center gap-3 h-14 px-4 bg-white border-b border-gray-100 flex-shrink-0 sticky top-0 z-40">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex items-center justify-center w-10 h-10 -ml-2 rounded-[var(--radius-md)] text-gray-600 hover:bg-gray-050 transition-colors cursor-pointer"
          aria-label="Menü öffnen"
        >
          <Menu className="w-5 h-5" />
        </button>
        {renderBrand(false)}
      </header>

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
