'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

interface ImpersonationBannerClientProps {
  agencyName: string;
}

export function ImpersonationBannerClient({ agencyName }: ImpersonationBannerClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleEnd() {
    await fetch('/api/admin/impersonate', { method: 'DELETE' });
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between bg-amber-500 px-4 py-2 text-sm font-medium text-white">
      <span>Du agierst als {agencyName}</span>
      <button
        onClick={handleEnd}
        disabled={isPending}
        className="rounded bg-white px-3 py-1 text-amber-600 font-semibold hover:bg-amber-50 disabled:opacity-60 transition-colors"
      >
        Beenden
      </button>
    </div>
  );
}
