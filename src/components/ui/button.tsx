'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pill?: boolean;
  glow?: boolean;
  children: ReactNode;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-10 px-5 text-sm',
  lg: 'h-11 px-6 text-base',
  xl: 'h-12 px-8 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', pill = false, glow = false, className = '', children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 font-semibold transition-colors cursor-pointer';
    const radius = pill ? 'rounded-full' : 'rounded-lg';

    const variants: Record<ButtonVariant, string> = {
      primary: `text-white ${disabled ? 'bg-red-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 shadow-sm'}`,
      secondary: `text-gray-900 border border-gray-300 ${disabled ? 'opacity-60 cursor-not-allowed' : 'bg-white hover:bg-gray-50 shadow-sm'}`,
      soft: `text-red-700 ${disabled ? 'opacity-60 cursor-not-allowed' : 'bg-red-50 hover:bg-red-100'}`,
      ghost: `text-gray-600 ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-100 hover:text-gray-900'}`,
    };

    return (
      <button ref={ref} disabled={disabled} className={`${base} ${radius} ${sizeClasses[size]} ${variants[variant]} ${className}`} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
