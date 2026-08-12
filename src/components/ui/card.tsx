import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const paddingMap = {
  sm: 'p-5',
  md: 'p-7',
  lg: 'p-9',
};

export function Card({ inset = false, padding = 'md', children, className = '', ...props }: CardProps) {
  const base = inset
    ? 'bg-[var(--surface-subtle)] border border-[var(--border-default)] rounded-[var(--radius-lg)]'
    : 'bg-white rounded-[var(--radius-lg)] border border-[var(--border-default)]';

  return (
    <div className={`${base} ${paddingMap[padding]} ${className}`} {...props}>
      {children}
    </div>
  );
}
