'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { bereichFuer } from '@/lib/navigation/bereiche';

/** Tabs des Bereichs (z. B. Sales: Controlling · Pipeline · After-Close · WhatsApp) über der Seite */
export function BereichTabs() {
  const pathname = usePathname();
  const treffer = bereichFuer(pathname);
  if (!treffer || treffer.bereich.tabs.length < 2) return null;
  return (
    <nav aria-label={treffer.bereich.label} className="-mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {treffer.bereich.tabs.map((t) => {
        const aktiv = t.href === treffer.tab;
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch={!t.href.startsWith('/api/')}
            aria-current={aktiv ? 'page' : undefined}
            className={`flex-shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition-colors ${
              aktiv ? 'bg-gradient-to-b from-red-700 to-red-950 text-red-50' : 'bg-panel text-gray-600 hover:text-ink'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
