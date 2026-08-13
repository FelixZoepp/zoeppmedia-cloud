import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const paddingMap = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({ inset = false, padding = 'md', children, className = '', ...props }: CardProps) {
  const base = inset
    ? 'bg-gray-50 border border-gray-200 rounded-xl'
    : 'bg-white rounded-xl border border-gray-200 shadow-sm';

  return (
    <div className={`${base} ${paddingMap[padding]} ${className}`} {...props}>
      {children}
    </div>
  );
}
