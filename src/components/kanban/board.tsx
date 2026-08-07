'use client';

import { useEffect, useState, useCallback } from 'react';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { KanbanColumn } from './column';
import { AddCandidateModal } from './add-candidate-modal';
import { FilterBar, applyFilters, type Filters } from './filters';
import { Button } from '@/components/ui/button';
import type { Candidate, PipelineStage } from '@/lib/types/database';
import { createClient } from '@/lib/supabase/client';

export function KanbanBoard() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState<Filters>({ search: '', source: '', stage: '', dateFrom: '', dateTo: '' });
  const supabase = createClient();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const loadData = useCallback(async () => {
    const [stagesRes, candidatesRes] = await Promise.all([
      supabase.from('pipeline_stages').select('*').order('sort_order'),
      fetch('/api/candidates').then((r) => r.json()),
    ]);

    setStages(stagesRes.data ?? []);
    setCandidates(candidatesRes ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const candidateId = active.id as string;
    const newStageId = over.id as string;

    const candidate = candidates.find((c) => c.id === candidateId);
    if (!candidate || candidate.current_stage_id === newStageId) return;

    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, current_stage_id: newStageId } : c))
    );

    const res = await fetch(`/api/candidates/${candidateId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: newStageId }),
    });

    if (!res.ok) {
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === candidateId ? { ...c, current_stage_id: candidate.current_stage_id } : c
        )
      );
    }
  }

  function handleCardClick(candidate: Candidate) {
    window.location.href = `/candidates/${candidate.id}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  const filteredCandidates = applyFilters(candidates, filters);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-[var(--text-h2)] font-extrabold text-[var(--text-primary)] tracking-[var(--tracking-heading)]">
          Pipeline
        </h1>
        <Button onClick={() => setShowAddModal(true)} size="md">
          <Plus className="w-4 h-4" />
          Bewerber
        </Button>
      </div>

      <FilterBar stages={stages} filters={filters} onChange={setFilters} />

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              candidates={filteredCandidates.filter((c) => c.current_stage_id === stage.id)}
              onCardClick={handleCardClick}
            />
          ))}
        </div>
      </DndContext>

      <AddCandidateModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={loadData}
      />
    </div>
  );
}
