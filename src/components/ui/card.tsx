import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const paddingMap = {
  sm: 'p-8',
  md: 'p-10',
  lg: 'p-14',
};

export function Card({ inset = false, padding = 'md', children, className = '', ...props }: CardProps) {
  const base = inset
    ? 'bg-[var(--surface-subtle)] border border-[var(--border-default)] rounded-[24px]'
    : 'bg-white rounded-[24px] border border-[var(--border-default)]';

  return (
    <div className={`${base} ${paddingMap[padding]} ${className}`} {...props}>
      {children}
    </div>
  );
}
