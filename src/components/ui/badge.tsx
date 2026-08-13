import type { ReactNode } from 'react';

type BadgeTone = 'accent' | 'softAccent' | 'success' | 'neutral' | 'outline';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<BadgeTone, string> = {
  accent: 'bg-red-600 text-white',
  softAccent: 'bg-red-50 text-red-700',
  success: 'bg-green-50 text-green-700',
  neutral: 'bg-gray-100 text-gray-600',
  outline: 'bg-white text-gray-600 border border-gray-200',
};

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${toneClasses[tone]} ${className}`}>
      {children}
    </span>
  );
}
