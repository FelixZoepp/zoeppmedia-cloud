'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, LogOut } from 'lucide-react';

interface ImpersonationBannerClientProps {
  agencyName: string;
}

export function ImpersonationBannerClient({ agencyName }: ImpersonationBannerClientProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleEnd() {
    setError(null);
    const res = await fetch('/api/admin/impersonate', { method: 'DELETE' });
    const data = (await res.json().catch(() => ({}))) as { zurueck?: string };
    if (!res.ok) {
      setError('Kunden-Login konnte nicht beendet werden.');
      return;
    }
    startTransition(() => {
      window.location.href = data.zurueck ?? '/admin';
    });
  }

  return (
    <div className="mb-5 flex flex-col rounded-[16px] bg-gradient-to-b from-amber-500 to-amber-600 px-4 py-2.5 text-sm font-medium text-white sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/innendienst" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 hover:bg-white/25">
          <ArrowLeft className="h-4 w-4" /> Alle Kunden
        </Link>
        <span className="min-w-0 flex-1 truncate">
          Eingeloggt bei <strong className="font-semibold">{agencyName}</strong>
        </span>
        <button
          onClick={handleEnd}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 font-semibold text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" /> Beenden
        </button>
      </div>
      {error && <div className="mt-2 text-amber-100">{error}</div>}
    </div>
  );
}
