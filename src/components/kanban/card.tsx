'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Candidate } from '@/lib/types/database';

const sourceLabels: Record<string, string> = {
  meta: 'Meta',
  indeed: 'Indeed',
  manual: 'Manuell',
};

const sourceColors: Record<string, string> = {
  meta: 'bg-blue-100 text-blue-700',
  indeed: 'bg-purple-100 text-purple-700',
  manual: 'bg-gray-100 text-gray-700',
};

export function KanbanCard({ candidate, onClick }: { candidate: Candidate; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: candidate.id,
    data: { candidate },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-sm"
    >
      <p className="font-medium text-gray-900 text-sm">{candidate.name}</p>
      {candidate.phone && <p className="text-xs text-gray-500 mt-1">{candidate.phone}</p>}
      <div className="mt-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${sourceColors[candidate.source] ?? 'bg-gray-100 text-gray-700'}`}>
          {sourceLabels[candidate.source] ?? candidate.source}
        </span>
      </div>
    </div>
  );
}
