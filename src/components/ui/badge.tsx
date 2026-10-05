import type { ReactNode } from 'react';

type BadgeTone = 'accent' | 'softAccent' | 'success' | 'neutral' | 'outline' | 'warning' | 'danger';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

// Fernly-Pills: kleine Ecken, feine Kontur in der Textfarbe
const toneClasses: Record<BadgeTone, string> = {
  accent: 'bg-red-950 text-red-50',
  softAccent: 'bg-red-50 text-red-700',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-600',
  neutral: 'bg-gray-100 text-gray-600',
  outline: 'bg-card text-gray-600',
};

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex flex-none items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium ${tone === 'accent' ? '' : 'shadow-[inset_0_0_0_1px_currentColor]'} ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
