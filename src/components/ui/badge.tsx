import type { ReactNode } from 'react';

type BadgeTone = 'accent' | 'softAccent' | 'success' | 'neutral' | 'outline';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<BadgeTone, string> = {
  accent: 'bg-[#E31B23] text-white',
  softAccent: 'bg-red-50 text-[#C00015]',
  success: 'bg-green-100 text-green-700',
  neutral: 'bg-[var(--surface-subtle)] text-[var(--text-secondary)]',
  outline: 'bg-white/60 text-[var(--text-secondary)] border border-[var(--border-default)]',
};

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-3 py-1 text-[13px] font-medium rounded-full ${toneClasses[tone]} ${className}`}>
      {children}
    </span>
  );
}
