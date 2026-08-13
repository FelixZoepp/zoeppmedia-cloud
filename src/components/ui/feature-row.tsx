import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

type FeatureRowTone = 'success' | 'accent' | 'neutral';

interface FeatureRowProps {
  icon?: ReactNode;
  tone?: FeatureRowTone;
  checked?: boolean;
  children: ReactNode;
}

const toneBg: Record<FeatureRowTone, string> = {
  success: 'bg-green-100 text-green-700',
  accent: 'bg-red-50 text-red-600',
  neutral: 'bg-gray-100 text-gray-600',
};

export function FeatureRow({ icon, tone = 'success', checked, children }: FeatureRowProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={`w-[38px] h-[38px] rounded-xl flex items-center justify-center flex-shrink-0 ${toneBg[tone]}`}>
        {icon || <Check className="w-5 h-5" />}
      </div>
      <span className="text-[15px] font-medium text-gray-900 flex-1">{children}</span>
      {checked && (
        <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
      )}
    </div>
  );
}
