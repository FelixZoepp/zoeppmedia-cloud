'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type IconButtonSize = 'sm' | 'md' | 'lg';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  active?: boolean;
  children: ReactNode;
}

const sizeMap: Record<IconButtonSize, string> = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', active = false, className = '', children, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center rounded-full transition-colors cursor-pointer';
    const state = active ? 'bg-red-100 text-red-800' : 'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-ink';

    return (
      <button ref={ref} className={`${base} ${sizeMap[size]} ${state} ${className}`} {...props}>
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
