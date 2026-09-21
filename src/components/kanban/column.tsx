'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { KanbanCard } from './card';
import type { PipelineStage } from '@/lib/types/database';
import type { ApplicationRow } from './board';

export function KanbanColumn({
  stage,
  applications,
  onCardClick,
}: {
  stage: PipelineStage;
  applications: ApplicationRow[];
  onCardClick: (app: ApplicationRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div className="flex-shrink-0 w-80 border-r border-gray-200 last:border-r-0 pr-4 last:pr-0">
      <div className="flex items-center gap-3 mb-4 px-1">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
        <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wider">{stage.name}</h3>
        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          {applications.length}
        </span>
      </div>
      <div ref={setNodeRef}
        className={`space-y-3 min-h-[200px] p-3 rounded-xl transition-colors ${
          isOver ? 'bg-red-50 border-2 border-dashed border-red-200' : 'bg-gray-50/50'
        }`}>
        <SortableContext items={applications.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          {applications.map((app) => (
            <KanbanCard key={app.id} application={app} onClick={() => onCardClick(app)} />
          ))}
          {applications.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">Keine Bewerber in dieser Stufe.</p>
          )}
        </SortableContext>
      </div>
    </div>
  );
}
