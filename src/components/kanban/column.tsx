'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { KanbanCard } from './card';
import type { Candidate, PipelineStage } from '@/lib/types/database';

export function KanbanColumn({
  stage,
  candidates,
  onCardClick,
}: {
  stage: PipelineStage;
  candidates: Candidate[];
  onCardClick: (candidate: Candidate) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div className="flex-shrink-0 w-80">
      <div className="flex items-center gap-4 mb-6 px-1">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
        <h3 className="font-semibold text-[var(--text-primary)] text-[15px]">{stage.name}</h3>
        <span className="text-[13px] font-medium text-[var(--text-tertiary)] bg-[var(--surface-inset)] px-2 py-0.5 rounded-full">
          {candidates.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`space-y-6 min-h-[200px] p-5 rounded-[var(--radius-lg)] transition-colors ${
          isOver ? 'bg-red-50' : 'bg-[var(--surface-subtle)]'
        }`}
      >
        <SortableContext items={candidates.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {candidates.map((candidate) => (
            <KanbanCard key={candidate.id} candidate={candidate} onClick={() => onCardClick(candidate)} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
