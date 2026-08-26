'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronRight, GraduationCap, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface ModuleProgress {
  id: string;
  title: string;
  sort_order: number;
  totalLessons: number;
  completedLessons: number;
  isComplete: boolean;
  isOverdue: boolean;
}

interface MasterclassData {
  modules: ModuleProgress[];
  totalModules: number;
  completedModules: number;
}

export function MasterclassProgress({ agencyId }: { agencyId: string }) {
  const [data, setData] = useState<MasterclassData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/dashboard/masterclass-progress?agencyId=${agencyId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [agencyId]);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-40 mb-4" />
        <div className="h-3 bg-gray-100 rounded-full w-full mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-50 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.totalModules === 0) return null;

  const progressPercent =
    data.totalModules > 0
      ? Math.round((data.completedModules / data.totalModules) * 100)
      : 0;

  // Find the first incomplete module
  const nextModule = data.modules.find((m) => !m.isComplete);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
          <GraduationCap className="w-4 h-4 text-red-600" />
        </div>
        <div className="flex-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-red-600">
            Masterclass
          </span>
          <span className="text-xs text-gray-400 ml-2">
            {data.completedModules}/{data.totalModules} Module
          </span>
        </div>
        <span className="text-sm font-bold text-gray-900">{progressPercent}%</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-5">
        <div
          className="h-full bg-red-600 rounded-full transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Module list */}
      <div className="space-y-1">
        {data.modules.map((mod) => {
          const isNext = nextModule?.id === mod.id;

          return (
            <div
              key={mod.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                mod.isOverdue && !mod.isComplete
                  ? 'bg-amber-50 border border-amber-200'
                  : isNext
                    ? 'bg-red-50'
                    : ''
              }`}
            >
              {/* Status icon */}
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 ${
                  mod.isComplete
                    ? 'bg-green-500 text-white'
                    : isNext
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {mod.isComplete ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  mod.sort_order
                )}
              </div>

              {/* Module title */}
              <span
                className={`text-sm flex-1 ${
                  mod.isComplete
                    ? 'text-gray-400'
                    : isNext
                      ? 'font-semibold text-gray-900'
                      : 'text-gray-600'
                }`}
              >
                {mod.title}
              </span>

              {/* Overdue indicator */}
              {mod.isOverdue && !mod.isComplete && (
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              )}

              {/* Progress or action */}
              {mod.isComplete ? (
                <Check className="w-4 h-4 text-green-500 shrink-0" />
              ) : isNext ? (
                <Link
                  href="/masterclass"
                  className="text-xs font-semibold text-red-600 hover:text-red-700 whitespace-nowrap flex items-center gap-0.5"
                >
                  Jetzt ansehen
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <span className="text-xs text-gray-400 shrink-0">
                  {mod.completedLessons}/{mod.totalLessons}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
