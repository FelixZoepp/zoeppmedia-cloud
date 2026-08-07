'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Candidate } from '@/lib/types/database';
import { Badge } from '@/components/ui/badge';

const sourceLabels: Record<string, string> = {
  meta: 'Meta',
  indeed: 'Indeed',
  manual: 'Manuell',
};

const sourceTones: Record<string, 'accent' | 'softAccent' | 'neutral'> = {
  meta: 'softAccent',
  indeed: 'accent',
  manual: 'neutral',
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
      className="bg-white border border-[var(--border-default)] rounded-[var(--radius-md)] p-3.5 cursor-grab active:cursor-grabbing hover:shadow-[var(--shadow-sm)] transition-shadow"
    >
      <p className="font-semibold text-[var(--text-primary)] text-[15px]">{candidate.name}</p>
      {candidate.phone && <p className="text-[13px] text-[var(--text-secondary)] mt-1">{candidate.phone}</p>}
      <div className="mt-2.5">
        <Badge tone={sourceTones[candidate.source] ?? 'neutral'}>
          {sourceLabels[candidate.source] ?? candidate.source}
        </Badge>
      </div>
    </div>
  );
}
