import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  hover?: boolean;
  children: ReactNode;
}

const paddingMap = {
  sm: 'p-8',
  md: 'p-12',
  lg: 'p-16',
};

export function Card({ inset = false, padding = 'md', hover = false, children, className = '', ...props }: CardProps) {
  const base = inset
    ? 'bg-[var(--surface-subtle)] border border-gray-100 rounded-[24px]'
    : 'bg-white rounded-[24px] border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.03)]';

  const hoverClass = hover
    ? 'transition-all duration-300 ease-out hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-0.5'
    : '';

  return (
    <div className={`${base} ${paddingMap[padding]} ${hoverClass} ${className}`} {...props}>
      {children}
    </div>
  );
}
