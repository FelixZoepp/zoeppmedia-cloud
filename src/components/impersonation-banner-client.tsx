'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface ImpersonationBannerClientProps {
  agencyName: string;
}

export function ImpersonationBannerClient({ agencyName }: ImpersonationBannerClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleEnd() {
    setError(null);
    const res = await fetch('/api/admin/impersonate', { method: 'DELETE' });
    if (!res.ok) {
      setError('Impersonation konnte nicht beendet werden.');
      return;
    }
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col bg-amber-500 px-4 py-2 text-sm font-medium text-white">
      <div className="flex items-center justify-between">
        <span>Du agierst als {agencyName}</span>
        <button
          onClick={handleEnd}
          disabled={isPending}
          className="rounded bg-white px-3 py-1 text-amber-600 font-semibold hover:bg-amber-50 disabled:opacity-60 transition-colors"
        >
          Beenden
        </button>
      </div>
      {error && <div className="mt-2 text-amber-100">{error}</div>}
    </div>
  );
}
