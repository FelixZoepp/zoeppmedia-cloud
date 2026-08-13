'use client';

import { type ReactNode } from 'react';

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

export function SegmentedControl({ items, value, onChange, className = '' }: SegmentedControlProps) {
  const normalized = items.map((item) =>
    typeof item === 'string' ? { value: item, label: item } : item
  );

  return (
    <div className={`inline-flex items-center gap-1 p-1 bg-white border border-gray-200 rounded-full ${className}`}>
      {normalized.map((item) => {
        const isActive = item.value === value;
        return (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-all cursor-pointer ${
              isActive
                ? 'bg-red-50 border border-red-200 text-red-600'
                : 'bg-transparent border border-transparent text-gray-600 hover:bg-gray-100'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
