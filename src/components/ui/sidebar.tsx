'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';

export interface SidebarItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
  badge?: ReactNode;
  /** Weitere Seiten, auf denen der Punkt aktiv ist (Bereich mit Tabs) */
  also?: string[];
}

export interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

interface SidebarProps {
  brand: string;
  /** Logo statt Buchstabe (Kundenportal) */
  brandImage?: string | null;
  brandLabel: string;
  brandSub?: string;
  groups: SidebarGroup[];
  bottomItems?: SidebarItem[];
  promo?: ReactNode;
  onClose?: () => void;
}

const RAIL_H = 40;

export function Sidebar({ brand, brandImage, brandLabel, brandSub, groups, bottomItems, promo, onClose }: SidebarProps) {
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  const lastY = useRef<number | null>(null);

  const allGroups = bottomItems?.length
    ? [...groups.filter((g) => g.items.length > 0), { label: 'Allgemein', items: bottomItems }]
    : groups.filter((g) => g.items.length > 0);

  // Längster passender Pfad gewinnt (z.B. /admin/kpi vor /admin)
  const activeHref = allGroups
    .flatMap((g) => g.items.flatMap((i) => [i.href, ...(i.also ?? [])].map((h) => ({ item: i.href, h }))))
    .filter(({ h }) => !h.startsWith('/api/') && (pathname === h || pathname.startsWith(h + '/')))
    .sort((a, b) => b.h.length - a.h.length)[0]?.item;

  // Der Balken wandert zum aktiven Link und streckt sich im Flug
  useLayoutEffect(() => {
    const nav = navRef.current;
    const rail = railRef.current;
    if (!nav || !rail) return;
    const link = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!link) {
      rail.style.opacity = '0';
      lastY.current = null;
      return;
    }
    const y = link.offsetTop + (link.offsetHeight - RAIL_H) / 2;
    const prev = lastY.current;
    rail.style.opacity = '1';
    rail.style.transform = `translateY(${y}px)`;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prev !== null && prev !== y && !reduce && typeof rail.animate === 'function') {
      const stretch = 1 + Math.min(1.6, Math.abs(y - prev) / 220);
      rail.animate(
        [
          { transform: `translateY(${prev}px) scaleY(1)` },
          { transform: `translateY(${(prev + y) / 2}px) scaleY(${stretch})`, offset: 0.45 },
          { transform: `translateY(${y}px) scaleY(1)` },
        ],
        { duration: 550, easing: 'cubic-bezier(.65, 0, .35, 1)' },
      );
    }
    lastY.current = y;
  }, [activeHref]);

  function renderItem(item: SidebarItem) {
    const isActive = item.href === activeHref;
    const cls = `group relative flex w-full items-center gap-3.5 px-7 py-[10px] text-[15px] transition-colors ${
      isActive ? 'font-semibold text-ink' : 'text-gray-600 hover:text-ink'
    }`;
    const icon = (
      <span
        className={`flex-shrink-0 transition-colors [&>svg]:h-[21px] [&>svg]:w-[21px] [&>svg]:stroke-[1.75] ${
          isActive ? 'text-red-700' : 'text-gray-600 group-hover:text-ink'
        }`}
      >
        {item.icon}
      </span>
    );
    const body = (
      <>
        {icon}
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge}
      </>
    );

    // Logout/API-Links dürfen kein Next.js Link sein (Prefetch würde ausloggen)
    if (item.href.startsWith('/api/')) {
      return (
        <a key={item.id} href={item.href} className={cls}>
          {body}
        </a>
      );
    }
    return (
      <Link key={item.id} href={item.href} className={cls} aria-current={isActive ? 'page' : undefined} onClick={onClose}>
        {body}
      </Link>
    );
  }

  return (
    <aside className="fx-shell flex h-full w-[252px] flex-shrink-0 flex-col overflow-y-auto overscroll-contain rounded-2xl bg-panel pb-[18px] pt-[26px]">
      {/* Marke */}
      <div className="flex items-center justify-between pl-[26px] pr-[22px]">
        <div className="flex min-w-0 items-center gap-3">
          {brandImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- Kunden-Logo aus dem Storage
            <img src={brandImage} alt="" className="h-10 w-10 flex-shrink-0 rounded-[12px] bg-card object-cover shadow-sm" />
          ) : (
            <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[12px] bg-gradient-to-b from-red-700 to-red-950 text-[17px] font-bold text-white shadow-hero">
              {brand}
            </div>
          )}
          <div className="min-w-0">
            <span className="block truncate text-[19px] font-semibold leading-tight tracking-[-0.03em] text-ink">
              {brandLabel}
            </span>
            {brandSub && <span className="block text-xs text-gray-500">{brandSub}</span>}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-[12px] hover:bg-gray-100" aria-label="Menü schließen">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation mit gemeinsamem Balken */}
      <nav ref={navRef} className="relative">
        <span
          ref={railRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-[1] w-[5px] origin-top rounded-r-[6px] bg-red-700 opacity-0"
          style={{ height: RAIL_H }}
        />
        {allGroups.map((group, gi) => (
          <div key={group.label} className={gi === 0 ? 'mt-8' : 'mt-7'}>
            <div className="px-7 pb-2.5 text-xs font-medium uppercase tracking-[0.06em] text-gray-500">{group.label}</div>
            <div className="flex flex-col">{group.items.map(renderItem)}</div>
          </div>
        ))}
      </nav>

      {promo && <div className="mx-[18px] mt-auto pt-6">{promo}</div>}
    </aside>
  );
}

/** Kleines dunkles Zähler-Badge für Navigationspunkte */
export function NavBadge({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto rounded-[6px] bg-red-950 px-[7px] py-0.5 text-[10.5px] font-semibold text-red-50">{children}</span>
  );
}
