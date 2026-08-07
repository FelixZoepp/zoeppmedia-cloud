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
  sm: 'h-8 px-3.5 text-[13px]',
  md: 'h-10 px-4 text-[15px]',
  lg: 'h-12 px-6 text-[15px]',
  xl: 'h-14 px-8 text-[17px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', pill = false, glow = false, className = '', children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 font-medium transition-all cursor-pointer focus-ring';
    const radius = pill ? 'rounded-full' : 'rounded-[var(--radius-md)]';

    const variants: Record<ButtonVariant, string> = {
      primary: `text-white ${disabled ? 'bg-red-200 opacity-60 cursor-not-allowed' : 'bg-gradient-to-b from-[#EF5B6F] to-red-500 hover:from-[#E94A60] hover:to-red-600 shadow-[var(--shadow-accent)]'}`,
      secondary: `bg-white text-gray-900 border border-gray-200 ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-050 shadow-[var(--shadow-xs)]'}`,
      soft: `bg-red-50 text-red-600 ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-red-100'}`,
      ghost: `bg-transparent text-gray-600 ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-050'}`,
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`${base} ${radius} ${sizeClasses[size]} ${variants[variant]} ${className}`}
        style={glow ? { boxShadow: 'var(--shadow-accent), 0 0 20px rgba(224,53,75,0.15)' } : undefined}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
