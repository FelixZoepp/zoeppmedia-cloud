import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  hover?: boolean;
  glass?: boolean;
  children: ReactNode;
}

const paddingMap = {
  sm: 'p-6',
  md: 'p-8',
  lg: 'p-10',
};

export function Card({ inset = false, padding = 'md', hover = false, glass = false, children, className = '', ...props }: CardProps) {
  const base = glass
    ? 'glass rounded-[16px]'
    : inset
      ? 'bg-[var(--surface-subtle)] border border-[var(--border-default)] rounded-[16px]'
      : 'bg-white/75 backdrop-blur-[20px] rounded-[16px] border border-[var(--border-default)] border-t-[var(--border-glass-top)] border-l-[var(--border-glass-side)] shadow-[var(--shadow-xs)]';

  const hoverClass = hover
    ? 'transition-all duration-300 ease-out hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5'
    : '';

  return (
    <div className={`${base} ${paddingMap[padding]} ${hoverClass} ${className}`} {...props}>
      {children}
    </div>
  );
}
