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

interface SidebarProps {
  brand: string;
  brandLabel: string;
  items: SidebarItem[];
  bottomItems?: SidebarItem[];
  promo?: ReactNode;
  children?: ReactNode;
}

export function Sidebar({ brand, brandLabel, items, bottomItems, promo }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col h-screen bg-white border-r border-gray-100 transition-all ${
        collapsed ? 'w-[68px]' : 'w-[250px]'
      }`}
      style={{ transitionDuration: 'var(--dur-med)', transitionTimingFunction: 'var(--ease-out)' }}
    >
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-100">
        <div className="w-[34px] h-[34px] rounded-[var(--radius-sm)] bg-gradient-to-b from-[#EF5B6F] to-red-500 flex items-center justify-center text-white font-bold text-[15px] flex-shrink-0">
          {brand}
        </div>
        {!collapsed && (
          <span className="text-[15px] font-semibold text-gray-900 truncate">{brandLabel}</span>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 flex flex-col gap-1 px-3 py-4 overflow-y-auto">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[var(--radius-pill)] text-[15px] font-medium transition-colors ${
                isActive
                  ? 'bg-red-50 border border-red-200 text-red-600'
                  : 'text-gray-900 hover:bg-gray-050 border border-transparent'
              } ${collapsed ? 'justify-center px-0' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className={`flex-shrink-0 ${isActive ? 'text-red-600' : 'text-gray-500'}`}>
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
        })}
      </nav>

      {/* Promo Slot */}
      {promo && !collapsed && (
        <div className="px-3 pb-2">
          {promo}
        </div>
      )}

      {/* Bottom Items */}
      {bottomItems && (
        <div className="flex flex-col gap-1 px-3 pb-2 border-t border-gray-100 pt-2">
          {bottomItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[var(--radius-pill)] text-[15px] font-medium transition-colors ${
                  isActive
                    ? 'bg-red-50 border border-red-200 text-red-600'
                    : 'text-gray-900 hover:bg-gray-050 border border-transparent'
                } ${collapsed ? 'justify-center px-0' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <span className={`flex-shrink-0 ${isActive ? 'text-red-600' : 'text-gray-500'}`}>
                  {item.icon}
                </span>
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              </Link>
            );
          })}
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
