'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  inputSize?: 'md' | 'lg';
  pill?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, inputSize = 'md', pill = false, className = '', ...props }, ref) => {
    const height = inputSize === 'lg' ? 'h-12' : 'h-10';
    const fontSize = inputSize === 'lg' ? 'text-base' : 'text-sm';
    const radius = pill ? 'rounded-full' : 'rounded-lg';

    return (
      <div className={`relative flex items-center bg-white border border-gray-300 shadow-sm ${height} ${radius} transition-colors focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-100 ${className}`}>
        {icon && <span className="pl-3 text-gray-400 flex-shrink-0">{icon}</span>}
        <input
          ref={ref}
          className={`w-full bg-transparent ${fontSize} text-gray-900 placeholder:text-gray-400 px-3 h-full outline-none ${icon ? 'pl-2' : ''}`}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';
