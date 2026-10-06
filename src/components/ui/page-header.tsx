import type { ReactNode } from 'react';
import { SplitText } from './motion';

interface PageHeaderProps {
  label?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  counter?: string;
}

export function PageHeader({ label, title, description, action, counter }: PageHeaderProps) {
  return (
    <div className="mb-[26px] flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {label && (
          <span className="fx-fade mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-red-700" style={{ '--d': '0ms' } as React.CSSProperties}>
            {label}
          </span>
        )}
        <SplitText as="h1" text={title} className="text-[clamp(30px,3vw,40px)] font-semibold leading-[1.1] tracking-[-0.035em] text-ink" />
        {description && <p className="fx-fade mt-2 text-[15px] text-gray-600">{description}</p>}
      </div>
      {(counter || action) && (
        <div className="fx-fade flex min-w-0 max-w-full flex-wrap items-center gap-3" style={{ '--d': '130ms' } as React.CSSProperties}>
          {counter && <span className="text-sm text-gray-600">{counter}</span>}
          {action}
        </div>
      )}
    </div>
  );
}
