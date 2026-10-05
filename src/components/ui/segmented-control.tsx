'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface SegmentItem {
  value: string;
  label: ReactNode;
}

interface SegmentedControlProps {
  items: (string | SegmentItem)[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Umschalter mit dunkelroter Pille, die zum gewählten Eintrag gleitet (7D / 30D / 90D). */
export function SegmentedControl({ items, value, onChange, className = '' }: SegmentedControlProps) {
  const normalized = items.map((item) => (typeof item === 'string' ? { value: item, label: item } : item));
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const place = () => {
      const btn = wrap.querySelector<HTMLElement>('[aria-pressed="true"]');
      setPill(btn ? { x: btn.offsetLeft, w: btn.offsetWidth } : null);
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [value, items.length]);

  return (
    <div ref={wrapRef} className={`relative inline-flex max-w-full items-center overflow-x-auto rounded-full bg-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
      {pill && (
        <span
          aria-hidden="true"
          className="absolute bottom-1 left-0 top-1 rounded-full bg-gradient-to-b from-red-700 to-red-950 transition-[transform,width] duration-500 ease-fern"
          style={{ width: pill.w, transform: `translateX(${pill.x}px)` }}
        />
      )}
      {normalized.map((item) => {
        const isActive = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(item.value)}
            className={`relative z-[1] flex-shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors duration-300 ${
              isActive ? 'text-red-50' : 'text-gray-600 hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
