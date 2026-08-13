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
    <div className="flex items-start justify-between mb-10">
      <div>
        {label && (
          <span className="label-caps text-[#E31B23] mb-2 block">
            {label}
          </span>
        )}
        <h1 className="text-[32px] font-bold text-[var(--text-primary)] tracking-[-0.01em] leading-[1.2]">
          {title}
        </h1>
        {description && (
          <p className="text-[16px] text-[var(--text-secondary)] mt-2 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-4">
        {counter && (
          <span className="label-caps text-[var(--text-tertiary)]">{counter}</span>
        )}
        {action}
      </div>
    </div>
  );
}
