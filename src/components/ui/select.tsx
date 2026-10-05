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
          className="h-11 w-full cursor-pointer appearance-none rounded-[12px] bg-card px-3.5 pr-10 text-[15px] font-medium text-ink shadow-[inset_0_0_0_1.5px_var(--hair)] outline-none transition-shadow focus:shadow-[inset_0_0_0_1.5px_var(--r-700),0_0_0_4px_var(--r-100)]"
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
);

Select.displayName = 'Select';
