'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Fernly-Buttons sind immer rund – bleibt für Kompatibilität erhalten */
  pill?: boolean;
  glow?: boolean;
  children: ReactNode;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-[50px] px-6 text-base',
  xl: 'h-[54px] px-[26px] text-base',
};

/** Gleiche Optik für Links (<Link className={buttonStyles('secondary')}>) */
export function buttonStyles(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className = '') {
  const base =
    'inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-full font-medium transition-[background,box-shadow,color,transform] duration-200 cursor-pointer active:scale-[.98] [&>svg]:h-[18px] [&>svg]:w-[18px]';
  const variants: Record<ButtonVariant, string> = {
    primary: 'text-red-50 bg-gradient-to-b from-red-700 to-red-950 hover:from-red-600 hover:to-red-800',
    secondary: 'text-ink bg-card shadow-[inset_0_0_0_1.5px_var(--r-950)] hover:bg-red-50',
    soft: 'text-red-800 bg-red-100 hover:bg-red-200',
    ghost: 'text-gray-600 hover:bg-gray-100 hover:text-ink',
  };
  return `${base} ${sizeClasses[size]} ${variants[variant]} ${className}`;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ({ variant = 'primary', size = 'md', pill: _pill, glow = false, className = '', children, disabled, ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-full font-medium transition-[background,box-shadow,color,transform] duration-200 cursor-pointer active:scale-[.98] [&>svg]:h-[18px] [&>svg]:w-[18px]';

    const variants: Record<ButtonVariant, string> = {
      primary: `text-red-50 ${
        disabled
          ? 'bg-red-300 cursor-not-allowed'
          : `bg-gradient-to-b from-red-700 to-red-950 hover:from-red-600 hover:to-red-800 ${glow ? 'shadow-hero' : ''}`
      }`,
      secondary: `text-ink bg-card shadow-[inset_0_0_0_1.5px_var(--r-950)] ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-50'}`,
      soft: `text-red-800 ${disabled ? 'opacity-50 cursor-not-allowed' : 'bg-red-100 hover:bg-red-200'}`,
      ghost: `text-gray-600 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 hover:text-ink'}`,
    };

    return (
      <button ref={ref} disabled={disabled} className={`${base} ${sizeClasses[size]} ${variants[variant]} ${className}`} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
