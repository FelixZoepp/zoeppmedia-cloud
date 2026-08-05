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
    <div className="flex-shrink-0 w-72">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
        <h3 className="font-medium text-gray-700 text-sm">{stage.name}</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{candidates.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`space-y-2 min-h-[200px] p-2 rounded-lg transition-colors ${isOver ? 'bg-blue-50' : 'bg-gray-50'}`}
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
