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
    <div className="flex items-start justify-between mb-8">
      <div>
        {label && (
          <span className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-1 block">
            {label}
          </span>
        )}
        <h1 className="text-2xl font-bold text-gray-900">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {counter && (
          <span className="text-sm text-gray-500">{counter}</span>
        )}
        {action}
      </div>
    </div>
  );
}
