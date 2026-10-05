import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
  /** Dunkelroter Verlauf wie die hervorgehobene Fernly-Karte */
  hero?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const paddingMap = {
  none: '',
  sm: 'p-5',
  md: 'p-[22px]',
  lg: 'p-8',
};

export function Card({ inset = false, hero = false, padding = 'md', children, className = '', ...props }: CardProps) {
  const base = hero
    ? 'fx-hero rounded-xl'
    : inset
      ? 'bg-panel rounded-xl shadow-[inset_0_0_0_1px_var(--hair)]'
      : 'bg-card rounded-xl shadow-sm';

  return (
    <div data-rise={inset ? undefined : ''} className={`relative min-w-0 ${base} ${paddingMap[padding]} ${className}`} {...props}>
      {children}
    </div>
  );
}

/** Kartenkopf: Titel links, Aktion rechts */
export function CardHead({ title, action, className = '' }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <h2 className="text-[19px] font-medium tracking-[-0.02em]">{title}</h2>
      {action}
    </div>
  );
}
