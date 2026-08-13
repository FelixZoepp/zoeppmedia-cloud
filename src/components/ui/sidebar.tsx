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
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-red-50 text-red-600'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <span className={`flex-shrink-0 ${isActive ? 'text-red-500' : 'text-gray-400'}`}>
          {item.icon}
        </span>
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge}
      </Link>
    );
  }

  return (
    <aside className="flex flex-col flex-shrink-0 h-screen w-[240px] bg-white border-r border-gray-200">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-5 h-14 border-b border-gray-200">
        <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {brand}
        </div>
        <div className="min-w-0">
          <span className="text-sm font-bold text-gray-900 uppercase block truncate">
            {brandLabel}
          </span>
          {brandSub && (
            <span className="text-xs text-gray-400 uppercase block">
              {brandSub}
            </span>
          )}
        </div>
      </div>

      {/* Grouped Nav */}
      <nav className="flex-1 flex flex-col px-3 pt-4 pb-3 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? 'mt-6' : ''}>
            <div className="px-3 mb-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {group.label}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}
      </nav>

      {promo && <div className="px-3 pb-2">{promo}</div>}

      {bottomItems && (
        <div className="flex flex-col gap-0.5 px-3 pb-4 border-t border-gray-200 pt-3">
          {bottomItems.map(renderItem)}
        </div>
      )}
    </aside>
  );
}
