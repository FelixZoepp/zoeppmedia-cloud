import type { ReactNode } from 'react';

interface PageHeaderProps {
  label?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  counter?: string;
}

export function PageHeader({ label, title, description, action, counter }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6 sm:mb-10">
      <div className="min-w-0">
        {label && (
          <span className="text-[11px] font-bold text-red-500 uppercase tracking-[0.1em] mb-1.5 block">
            {label}
          </span>
        )}
        <h1 className="text-[24px] sm:text-[28px] font-extrabold text-[var(--text-primary)] tracking-[var(--tracking-heading)] leading-[var(--leading-heading)]">
          {title}
        </h1>
        {description && (
          <p className="text-[15px] text-[var(--text-secondary)] mt-2">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        {counter && (
          <span className="text-[13px] font-medium text-[var(--text-tertiary)]">{counter}</span>
        )}
        {action}
      </div>
    </div>
  );
}
