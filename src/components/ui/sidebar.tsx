'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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

  function renderItem(item: SidebarItem) {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
    return (
      <Link
        key={item.id}
        href={item.href}
        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[var(--radius-pill)] text-[14px] font-medium transition-colors ${
          isActive
            ? 'bg-red-50 border border-red-200 text-red-600'
            : 'text-gray-900 hover:bg-gray-050 border border-transparent'
        } ${collapsed ? 'justify-center px-0' : ''}`}
        title={collapsed ? item.label : undefined}
      >
        <span className={`flex-shrink-0 ${isActive ? 'text-red-600' : 'text-gray-400'}`}>
          {item.icon}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge}
          </>
        )}
      </Link>
    );
  }

  return (
    <aside
      className={`flex flex-col flex-shrink-0 h-screen bg-white border-r border-gray-100 transition-all ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
      style={{ transitionDuration: 'var(--dur-med)', transitionTimingFunction: 'var(--ease-out)' }}
    >
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="w-[36px] h-[36px] rounded-[var(--radius-sm)] bg-gradient-to-b from-[#EF5B6F] to-red-500 flex items-center justify-center text-white font-bold text-[15px] flex-shrink-0">
          {brand}
        </div>
        {!collapsed && (
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

      {/* Grouped Nav */}
      <nav className="flex-1 flex flex-col px-3 py-2 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? 'mt-6' : ''}>
            {!collapsed && (
              <div className="px-3.5 mb-2">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.08em]">
                  {group.label}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* Promo Slot */}
      {promo && !collapsed && (
        <div className="px-3 pb-2">
          {promo}
        </div>
      )}

      {/* Bottom Items */}
      {bottomItems && (
        <div className="flex flex-col gap-0.5 px-3 pb-2 border-t border-gray-100 pt-3">
          {bottomItems.map(renderItem)}
        </div>
      )}

      {/* Collapse Toggle */}
      <div className="px-3 pb-4 pt-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full h-8 rounded-[var(--radius-md)] text-gray-400 hover:bg-gray-050 hover:text-gray-600 transition-colors cursor-pointer"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
