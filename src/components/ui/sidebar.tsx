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
        className={`flex items-center gap-4 px-4 py-3 rounded-[10px] text-[15px] font-medium transition-all duration-200 ${
          isActive
            ? 'bg-red-50 text-[#C00015]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]'
        }`}
      >
        <span className={`flex-shrink-0 ${isActive ? 'text-[#E31B23]' : 'text-[var(--text-tertiary)]'}`}>
          {item.icon}
        </span>
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge}
      </Link>
    );
  }

  return (
    <aside className="flex flex-col flex-shrink-0 h-screen w-[240px] bg-white border-r border-[var(--border-default)]">
      {/* Brand Header */}
      <div className="flex items-center gap-3.5 px-6 h-[64px] border-b border-[var(--border-default)]">
        <div className="w-9 h-9 rounded-[10px] bg-gradient-to-b from-[#E31B23] to-[#C00015] flex items-center justify-center text-white font-bold text-[14px] flex-shrink-0 shadow-[0_2px_8px_rgba(227,27,35,0.25)]">
          {brand}
        </div>
        <div className="min-w-0">
          <span className="text-[14px] font-bold text-[var(--text-primary)] tracking-[0.02em] uppercase block truncate">
            {brandLabel}
          </span>
          {brandSub && (
            <span className="label-caps text-[var(--text-tertiary)] block mt-0.5">
              {brandSub}
            </span>
          )}
        </div>
      </div>

      {/* Grouped Nav */}
      <nav className="flex-1 flex flex-col px-4 pt-6 pb-4 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? 'mt-8' : ''}>
            <div className="px-4 mb-3">
              <span className="label-caps text-[var(--text-tertiary)]">
                {group.label}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* Promo Slot */}
      {promo && (
        <div className="px-4 pb-2">
          {promo}
        </div>
      )}

      {/* Bottom Items */}
      {bottomItems && (
        <div className="flex flex-col gap-1 px-4 pb-5 border-t border-[var(--border-default)] pt-4">
          {bottomItems.map(renderItem)}
        </div>
      )}
    </aside>
  );
}
