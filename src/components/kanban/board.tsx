'use client';

import { useEffect, useState, useCallback } from 'react';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Plus, Download } from 'lucide-react';
import { KanbanColumn } from './column';
import { AddCandidateModal } from './add-candidate-modal';
import { FilterBar, applyFilters, type Filters } from './filters';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import type { Candidate, PipelineStage } from '@/lib/types/database';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const REJECTION_REASONS = [
  'Nicht erschienen zum Probetag',
  'Nach Probetag abgelehnt',
  'Mangelnde Einsatzbereitschaft',
  'Kein Führerschein / Kein Auto',
  'Sprachbarriere',
  'Nur Festanstellung gewünscht',
  'Minderjährig',
  'Keine Motivation erkennbar',
  'Bewerber hat abgesagt',
  'Nicht erreichbar (nach 3 Versuchen)',
  'Falsche Erwartungen an den Verdienst',
  'Sonstiges',
];

export function KanbanBoard() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState<Filters>({ search: '', source: '', stage: '', dateFrom: '', dateTo: '' });

  // Rejection modal state
  const [rejectionModal, setRejectionModal] = useState<{
    candidateId: string;
    candidateName: string;
    stageId: string;
    previousStageId: string;
  } | null>(null);
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const supabase = createClient();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const loadData = useCallback(async () => {
    const [stagesRes, candidatesRes] = await Promise.all([
      supabase.from('pipeline_stages').select('*').order('sort_order'),
      fetch('/api/candidates').then((r) => r.json()),
    ]);

    if (stagesRes.data) setStages(stagesRes.data);
    if (Array.isArray(candidatesRes)) {
      setCandidates(candidatesRes);
    } else if (candidatesRes.data) {
      setCandidates(candidatesRes.data);
    }
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

    // Check if target stage is "Abgesagt" (last stage or name contains "abgesagt/absage")
    const targetStage = stages.find((s) => s.id === newStageId);
    const isRejectionStage = targetStage &&
      (targetStage.name.toLowerCase().includes('abgesagt') ||
       targetStage.name.toLowerCase().includes('absage') ||
       targetStage.sort_order === Math.max(...stages.map(s => s.sort_order)));

    if (isRejectionStage) {
      // Show rejection reason modal instead of moving immediately
      setRejectionModal({
        candidateId,
        candidateName: candidate.name,
        stageId: newStageId,
        previousStageId: candidate.current_stage_id,
      });
      setSelectedReason('');
      setCustomReason('');
      return;
    }

    // Normal stage move
    await moveCandidate(candidateId, newStageId, candidate.current_stage_id);
  }

  async function moveCandidate(candidateId: string, newStageId: string, previousStageId: string, rejectionReason?: string) {
    // Optimistic update
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, current_stage_id: newStageId } : c))
    );

    const body: Record<string, string> = { stage_id: newStageId };
    if (rejectionReason) body.rejection_reason = rejectionReason;

    const res = await fetch(`/api/candidates/${candidateId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Rollback
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, current_stage_id: previousStageId } : c))
      );
      toast.error('Phase konnte nicht geändert werden');
    } else if (rejectionReason) {
      toast.success('Bewerber abgesagt');
    }
  }

  async function handleRejectionConfirm() {
    if (!rejectionModal) return;
    const reason = selectedReason === 'Sonstiges' ? customReason : selectedReason;
    if (!reason) return;

    setRejecting(true);
    await moveCandidate(
      rejectionModal.candidateId,
      rejectionModal.stageId,
      rejectionModal.previousStageId,
      reason
    );
    setRejecting(false);
    setRejectionModal(null);
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
      <PageHeader
        label="PIPELINE"
        title="Pipeline"
        action={
          <div className="flex items-center gap-2">
            <a
              href="/api/export/candidates"
              download
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              CSV
            </a>
            <Button onClick={() => setShowAddModal(true)} size="md">
              <Plus className="w-4 h-4" />
              Neuer Bewerber
            </Button>
          </div>
        }
      />

      <FilterBar stages={stages} filters={filters} onChange={setFilters} />

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-0 overflow-x-auto pb-4">
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

      {showAddModal && (
        <AddCandidateModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            loadData();
          }}
        />
      )}

      {/* Rejection Reason Modal */}
      <Modal
        open={!!rejectionModal}
        onClose={() => setRejectionModal(null)}
        title="Absagegrund"
        width="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Warum wird <strong>{rejectionModal?.candidateName}</strong> abgesagt?
          </p>

          <div className="space-y-2">
            {REJECTION_REASONS.map((reason) => (
              <label
                key={reason}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedReason === reason
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="rejection_reason"
                  value={reason}
                  checked={selectedReason === reason}
                  onChange={() => setSelectedReason(reason)}
                  className="sr-only"
                />
                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  selectedReason === reason ? 'border-red-500' : 'border-gray-300'
                }`}>
                  {selectedReason === reason && <span className="w-2 h-2 rounded-full bg-red-500" />}
                </span>
                <span className="text-sm">{reason}</span>
              </label>
            ))}
          </div>

          {selectedReason === 'Sonstiges' && (
            <textarea
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Absagegrund eingeben..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none"
            />
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setRejectionModal(null)}
            >
              Abbrechen
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={!selectedReason || (selectedReason === 'Sonstiges' && !customReason.trim()) || rejecting}
              onClick={handleRejectionConfirm}
            >
              {rejecting ? 'Wird gespeichert...' : 'Absage bestätigen'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
