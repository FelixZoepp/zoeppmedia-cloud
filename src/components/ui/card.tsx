import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const paddingMap = {
  sm: 'p-6',
  md: 'p-8',
  lg: 'p-10',
};

export function Card({ inset = false, padding = 'md', children, className = '', ...props }: CardProps) {
  const base = inset
    ? 'bg-[var(--surface-subtle)] border border-[var(--border-default)] rounded-[20px]'
    : 'bg-white rounded-[20px] border border-[var(--border-default)]';

  return (
    <div className={`${base} ${paddingMap[padding]} ${className}`} {...props}>
      {children}
    </div>
  );
}
