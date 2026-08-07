'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  inputSize?: 'md' | 'lg';
  pill?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, inputSize = 'md', pill = false, className = '', ...props }, ref) => {
    const height = inputSize === 'lg' ? 'h-14' : 'h-11';
    const fontSize = inputSize === 'lg' ? 'text-[17px]' : 'text-[15px]';
    const radius = pill ? 'rounded-full' : 'rounded-[var(--radius-md)]';

    return (
      <div className={`relative flex items-center bg-white border border-gray-200 shadow-[var(--shadow-xs)] ${height} ${radius} ${className}`}>
        {icon && <span className="pl-4 text-gray-400 flex-shrink-0">{icon}</span>}
        <input
          ref={ref}
          className={`w-full bg-transparent ${fontSize} text-gray-900 placeholder:text-gray-400 px-4 h-full outline-none ${icon ? 'pl-2.5' : ''}`}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';
