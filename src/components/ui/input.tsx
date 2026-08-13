'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  inputSize?: 'md' | 'lg';
  pill?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, inputSize = 'md', pill = false, className = '', ...props }, ref) => {
    const height = inputSize === 'lg' ? 'h-14' : 'h-12';
    const fontSize = inputSize === 'lg' ? 'text-[17px]' : 'text-[15px]';
    const radius = pill ? 'rounded-full' : 'rounded-[10px]';

    return (
      <div className={`relative flex items-center bg-white/60 backdrop-blur-sm border border-[var(--border-default)] ${height} ${radius} transition-all duration-300 focus-within:border-[#E31B23] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(227,27,35,0.08)] ${className}`}>
        {icon && <span className="pl-4 text-[var(--text-tertiary)] flex-shrink-0">{icon}</span>}
        <input
          ref={ref}
          className={`w-full bg-transparent ${fontSize} text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] px-4 h-full outline-none ${icon ? 'pl-3' : ''}`}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';
