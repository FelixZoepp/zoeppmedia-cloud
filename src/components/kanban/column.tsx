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
    <div className="flex-shrink-0 w-80 border-r border-gray-200 last:border-r-0 pr-4 last:pr-0">
      <div className="flex items-center gap-3 mb-4 px-1">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
        <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wider">{stage.name}</h3>
        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          {candidates.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`space-y-3 min-h-[200px] p-3 rounded-xl transition-colors ${
          isOver ? 'bg-red-50 border-2 border-dashed border-red-200' : 'bg-gray-50/50'
        }`}
      >
        <SortableContext items={candidates.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {candidates.map((candidate) => (
            <KanbanCard key={candidate.id} candidate={candidate} onClick={() => onCardClick(candidate)} />
          ))}
          {candidates.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">Keine Kandidaten in dieser Phase.</p>
          )}
        </SortableContext>
      </div>
    </div>
  );
}
