'use client';

import { User } from 'lucide-react';

interface RecentCandidatesProps {
  candidates: { id: string; name: string; source: string; created_at: string }[];
}

const sourceLabels: Record<string, string> = {
  meta: 'Meta Ads',
  indeed: 'Indeed',
  manual: 'Manuell',
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;

  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Gestern';
  if (diffD < 7) return `vor ${diffD} Tagen`;

  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

export function RecentCandidates({ candidates }: RecentCandidatesProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <h3 className="text-[15px] font-semibold text-gray-900 mb-4">
        Bewerber
      </h3>
      {candidates.length === 0 ? (
        <p className="text-[13px] text-gray-400">Noch keine Bewerber</p>
      ) : (
        <div className="space-y-4">
          {candidates.map((c) => (
            <a
              key={c.id}
              href={`/candidates/${c.id}`}
              className="flex items-start gap-3 group"
            >
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4 text-gray-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-gray-900 truncate group-hover:text-red-500 transition-colors">
                  {c.name}
                </p>
                <p className="text-[11px] text-gray-400">
                  {sourceLabels[c.source] || c.source}
                </p>
                <p className="text-[11px] text-gray-400">
                  {timeAgo(c.created_at)}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
