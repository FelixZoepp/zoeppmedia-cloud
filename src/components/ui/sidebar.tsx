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
        className={`flex items-center gap-3 px-3.5 py-3 rounded-[var(--radius-sm)] text-[14px] font-medium transition-all duration-150 ${
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
    <aside className="flex flex-col flex-shrink-0 h-screen w-[260px] bg-white border-r border-[var(--border-default)]">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-[var(--border-default)]">
        <div className="w-8 h-8 rounded-[var(--radius-xs)] bg-gradient-to-b from-[#EF5B6F] to-red-500 flex items-center justify-center text-white font-bold text-[13px] flex-shrink-0">
          {brand}
        </div>
        <div className="min-w-0">
          <span className="text-[13px] font-bold text-[var(--text-primary)] tracking-[0.04em] uppercase block truncate">
            {brandLabel}
          </span>
          {brandSub && (
            <span className="text-[11px] font-medium text-[var(--text-tertiary)] tracking-[0.02em] uppercase block leading-tight">
              {brandSub}
            </span>
          )}
        </div>
      </div>

      {/* Grouped Nav */}
      <nav className="flex-1 flex flex-col px-4 pt-6 pb-4 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? 'mt-7' : ''}>
            <div className="px-3 mb-2">
              <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-[0.08em]">
                {group.label}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* Promo Slot */}
      {promo && (
        <div className="px-3 pb-2">
          {promo}
        </div>
      )}

      {/* Bottom Items */}
      {bottomItems && (
        <div className="flex flex-col gap-0.5 px-3 pb-4 border-t border-[var(--border-default)] pt-3">
          {bottomItems.map(renderItem)}
        </div>
      )}
    </aside>
  );
}
