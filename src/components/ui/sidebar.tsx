'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

  function renderItem(item: SidebarItem) {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
    return (
      <Link
        key={item.id}
        href={item.href}
        className={`flex items-center gap-5 px-5 py-4 rounded-[14px] text-[15px] font-medium transition-all duration-300 ease-out ${
          isActive
            ? 'bg-red-50 text-red-600 shadow-[0_0_0_1px_rgba(224,53,75,0.1)]'
            : 'text-[var(--text-secondary)] hover:bg-gray-50/80 hover:text-[var(--text-primary)] hover:translate-x-1 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
        }`}
      >
        <span className={`flex-shrink-0 transition-transform duration-300 ${isActive ? 'text-red-500 scale-110' : 'text-[var(--text-tertiary)] group-hover:scale-110'}`}>
          {item.icon}
        </span>
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge}
      </Link>
    );
  }

  return (
    <aside className="flex flex-col flex-shrink-0 h-screen w-[300px] bg-white border-r border-gray-100">
      {/* Brand Header */}
      <div className="flex items-center gap-5 px-8 h-[88px] border-b border-gray-100">
        <div className="w-11 h-11 rounded-[12px] bg-gradient-to-b from-[#EF5B6F] to-red-500 flex items-center justify-center text-white font-bold text-[15px] flex-shrink-0 shadow-[0_2px_8px_rgba(224,53,75,0.25)]">
          {brand}
        </div>
        <div className="min-w-0">
          <span className="text-[15px] font-bold text-[var(--text-primary)] tracking-[0.04em] uppercase block truncate">
            {brandLabel}
          </span>
          {brandSub && (
            <span className="text-[12px] font-medium text-[var(--text-tertiary)] tracking-[0.02em] uppercase block leading-tight mt-1">
              {brandSub}
            </span>
          )}
        </div>
      </div>

      {/* Grouped Nav */}
      <nav className="flex-1 flex flex-col px-6 pt-10 pb-8 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? 'mt-12' : ''}>
            <div className="px-5 mb-6">
              <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.14em]">
                {group.label}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* Promo Slot */}
      {promo && (
        <div className="px-6 pb-4">
          {promo}
        </div>
      )}

      {/* Bottom Items */}
      {bottomItems && (
        <div className="flex flex-col gap-3 px-6 pb-8 border-t border-gray-100 pt-6">
          {bottomItems.map(renderItem)}
        </div>
      )}
    </aside>
  );
}
