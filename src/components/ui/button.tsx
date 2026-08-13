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
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-6 text-[15px]',
  lg: 'h-13 px-8 text-[15px]',
  xl: 'h-15 px-10 text-[17px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', pill = false, glow = false, className = '', children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2.5 font-semibold transition-all duration-300 ease-out cursor-pointer focus-ring';
    const radius = pill ? 'rounded-full' : 'rounded-[10px]';

    const variants: Record<ButtonVariant, string> = {
      primary: `text-white ${disabled ? 'bg-red-300 opacity-60 cursor-not-allowed' : 'bg-gradient-to-b from-[#E31B23] to-[#C00015] hover:from-[#C00015] hover:to-[#93000D] hover:shadow-[0_4px_20px_rgba(227,27,35,0.3)] hover:-translate-y-0.5 active:translate-y-0 shadow-[var(--shadow-accent)]'}`,
      secondary: `bg-white/80 backdrop-blur-sm text-[var(--text-primary)] border border-[var(--border-default)] ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] hover:-translate-y-0.5 active:translate-y-0'}`,
      soft: `bg-red-50 text-[#C00015] ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-red-100 hover:shadow-[0_2px_8px_rgba(227,27,35,0.1)] hover:-translate-y-0.5 active:translate-y-0'}`,
      ghost: `bg-transparent text-[var(--text-secondary)] ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]'}`,
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`${base} ${radius} ${sizeClasses[size]} ${variants[variant]} ${className}`}
        style={glow ? { boxShadow: 'var(--shadow-accent), 0 0 24px rgba(227,27,35,0.15)' } : undefined}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
