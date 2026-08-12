'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  inputSize?: 'md' | 'lg';
  pill?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, inputSize = 'md', pill = false, className = '', ...props }, ref) => {
    const height = inputSize === 'lg' ? 'h-16' : 'h-13';
    const fontSize = inputSize === 'lg' ? 'text-[17px]' : 'text-[15px]';
    const radius = pill ? 'rounded-full' : 'rounded-[14px]';

    return (
      <div className={`relative flex items-center bg-white border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${height} ${radius} transition-all duration-300 focus-within:border-red-300 focus-within:shadow-[0_0_0_3px_rgba(224,53,75,0.08)] ${className}`}>
        {icon && <span className="pl-5 text-gray-400 flex-shrink-0">{icon}</span>}
        <input
          ref={ref}
          className={`w-full bg-transparent ${fontSize} text-gray-900 placeholder:text-gray-400 px-5 h-full outline-none ${icon ? 'pl-3' : ''}`}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';
