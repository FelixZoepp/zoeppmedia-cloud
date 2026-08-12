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
    <div className="flex items-start justify-between mb-16">
      <div>
        {label && (
          <span className="text-[12px] font-bold text-red-500 uppercase tracking-[0.12em] mb-2 block">
            {label}
          </span>
        )}
        <h1 className="text-[38px] font-extrabold text-[var(--text-primary)] tracking-tight leading-[1.1]">
          {title}
        </h1>
        {description && (
          <p className="text-[16px] text-[var(--text-secondary)] mt-4 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-4">
        {counter && (
          <span className="text-[14px] font-medium text-[var(--text-tertiary)]">{counter}</span>
        )}
        {action}
      </div>
    </div>
  );
}
