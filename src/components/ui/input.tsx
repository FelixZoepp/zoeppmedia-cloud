'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  inputSize?: 'md' | 'lg';
  pill?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, inputSize = 'md', pill = false, className = '', ...props }, ref) => {
    const height = inputSize === 'lg' ? 'h-[50px]' : 'h-11';
    const fontSize = inputSize === 'lg' ? 'text-base' : 'text-[15px]';
    const radius = pill ? 'rounded-full' : 'rounded-[12px]';

    return (
      <div
        className={`relative flex items-center bg-card shadow-[inset_0_0_0_1.5px_var(--hair)] ${height} ${radius} transition-shadow focus-within:shadow-[inset_0_0_0_1.5px_var(--r-700),0_0_0_4px_var(--r-100)] ${className}`}
      >
        {icon && <span className="flex-shrink-0 pl-3.5 text-gray-500">{icon}</span>}
        <input
          ref={ref}
          className={`h-full w-full bg-transparent px-3.5 ${fontSize} text-ink outline-none placeholder:text-gray-500 focus-visible:shadow-none ${icon ? 'pl-2' : ''}`}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';
