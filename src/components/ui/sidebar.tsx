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
        className={`flex items-center gap-4 px-4 py-3 rounded-[10px] text-[15px] font-medium transition-all duration-150 ${
          isActive
            ? 'bg-red-50 text-red-600'
            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]'
        }`}
      >
        <span className={`flex-shrink-0 ${isActive ? 'text-red-500' : 'text-[var(--text-tertiary)]'}`}>
          {item.icon}
        </span>
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge}
      </Link>
    );
  }

  return (
    <aside className="flex flex-col flex-shrink-0 h-screen w-[280px] bg-white border-r border-[var(--border-default)]">
      {/* Brand Header */}
      <div className="flex items-center gap-4 px-6 h-[72px] border-b border-[var(--border-default)]">
        <div className="w-9 h-9 rounded-[8px] bg-gradient-to-b from-[#EF5B6F] to-red-500 flex items-center justify-center text-white font-bold text-[14px] flex-shrink-0">
          {brand}
        </div>
        <div className="min-w-0">
          <span className="text-[14px] font-bold text-[var(--text-primary)] tracking-[0.04em] uppercase block truncate">
            {brandLabel}
          </span>
          {brandSub && (
            <span className="text-[11px] font-medium text-[var(--text-tertiary)] tracking-[0.02em] uppercase block leading-tight mt-0.5">
              {brandSub}
            </span>
          )}
        </div>
      </div>

      {/* Grouped Nav */}
      <nav className="flex-1 flex flex-col px-5 pt-8 pb-6 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? 'mt-10' : ''}>
            <div className="px-4 mb-4">
              <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-[0.1em]">
                {group.label}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* Promo Slot */}
      {promo && (
        <div className="px-5 pb-3">
          {promo}
        </div>
      )}

      {/* Bottom Items */}
      {bottomItems && (
        <div className="flex flex-col gap-2 px-5 pb-6 border-t border-[var(--border-default)] pt-5">
          {bottomItems.map(renderItem)}
        </div>
      )}
    </aside>
  );
}
