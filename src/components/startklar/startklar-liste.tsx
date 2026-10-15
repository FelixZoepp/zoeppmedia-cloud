import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';
import type { Startklar } from '@/lib/startklar/schritte';

/** Fortschrittsbalken + Schrittliste der Startklar-Checkliste (Kundenportal und Kundenakte) */
export function StartklarListe({ startklar, mitLinks = true }: { startklar: Startklar; mitLinks?: boolean }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={startklar.prozent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-red-700 transition-[width]" style={{ width: `${startklar.prozent}%` }} />
        </div>
        <span className="text-[13px] font-medium text-gray-600">
          {startklar.erledigt} von {startklar.gesamt}
        </span>
      </div>
      <ul className="mt-4 space-y-3">
        {startklar.schritte.map((s) => (
          <li key={s.key} className="flex items-start gap-3">
            {s.erledigt ? <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-green-700" /> : <Circle className="mt-0.5 h-5 w-5 flex-none text-gray-300" />}
            <div className="min-w-0 flex-1">
              <p className={`text-[14.5px] font-medium ${s.erledigt ? 'text-gray-500 line-through decoration-gray-300' : ''}`}>{s.titel}</p>
              {!s.erledigt && <p className="text-[13px] text-gray-600">{s.erklaerung}</p>}
            </div>
            {mitLinks && !s.erledigt && s.href && (
              <Link href={s.href} className="flex-none text-[13px] font-semibold text-red-700 underline-offset-2 hover:underline">
                Los geht’s →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
