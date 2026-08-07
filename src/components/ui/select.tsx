'use client';

import { forwardRef, type SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, className = '', ...props }, ref) => {
    return (
      <div className={`relative ${className}`}>
        <select
          ref={ref}
          className="appearance-none w-full h-11 bg-white border border-gray-200 rounded-[var(--radius-md)] px-4 pr-10 text-[15px] font-medium text-gray-900 shadow-[var(--shadow-xs)] cursor-pointer outline-none focus-ring"
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
);

Select.displayName = 'Select';
