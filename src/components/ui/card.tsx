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
    ? 'bg-gray-025 border border-gray-100 rounded-[var(--radius-lg)]'
    : 'bg-white rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)]';

  return (
    <div className={`${base} ${paddingMap[padding]} ${className}`} {...props}>
      {children}
    </div>
  );
}
