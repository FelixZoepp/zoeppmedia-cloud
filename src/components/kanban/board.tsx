'use client';

import { useEffect, useState, useCallback } from 'react';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Plus, Download } from 'lucide-react';
import { KanbanColumn } from './column';
import { AddCandidateModal } from './add-candidate-modal';
import { ApplicationFilterBar, applyApplicationFilters, type ApplicationFilters } from './filters';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import type { PipelineStage } from '@/lib/types/database';
import { toast } from 'sonner';

export interface ApplicationRow {
  id: string;
  candidate_id: string;
  job_id: string;
  stage_id: string | null;
  source: string;
  score_label: string | null;
  applied_at: string;
  status: string;
  candidate: { id: string; name: string; phone: string | null; phone_e164: string | null; email: string | null; source: string };
  job: { id: string; title: string; slug: string };
  stage: { id: string; name: string; color: string; stage_type: string | null } | null;
}

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

export function KanbanBoard({ hideHeader }: { hideHeader?: boolean } = {}) {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState<ApplicationFilters>({
    search: '', source: '', stage: '', job: '', dateFrom: '', dateTo: '',
  });

  const [rejectionModal, setRejectionModal] = useState<{
    applicationId: string;
    candidateName: string;
    stageId: string;
    previousStageId: string | null;
  } | null>(null);
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const loadData = useCallback(async () => {
    const [stagesRes, appsRes, jobsRes] = await Promise.all([
      fetch('/api/pipeline-stages').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/applications').then((r) => r.json()),
      fetch('/api/jobs').then((r) => r.json()),
    ]);
    if (Array.isArray(stagesRes)) setStages(stagesRes);
    if (Array.isArray(appsRes)) setApplications(appsRes);
    if (Array.isArray(jobsRes)) setJobs(jobsRes.map((j: { id: string; title: string }) => ({ id: j.id, title: j.title })));
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const applicationId = active.id as string;
    const newStageId = over.id as string;
    const app = applications.find((a) => a.id === applicationId);
    if (!app || app.stage_id === newStageId) return;

    const targetStage = stages.find((s) => s.id === newStageId);
    const isRejection = targetStage && targetStage.stage_type === 'rejected';

    if (isRejection) {
      setRejectionModal({
        applicationId,
        candidateName: app.candidate.name,
        stageId: newStageId,
        previousStageId: app.stage_id,
      });
      setSelectedReason('');
      setCustomReason('');
      return;
    }

    await moveApplication(applicationId, newStageId, app.stage_id);
  }

  async function moveApplication(applicationId: string, newStageId: string, previousStageId: string | null, rejectionReason?: string) {
    setApplications((prev) =>
      prev.map((a) => (a.id === applicationId ? { ...a, stage_id: newStageId } : a))
    );

    const body: Record<string, string> = { stage_id: newStageId };
    if (rejectionReason) body.rejection_reason = rejectionReason;

    const res = await fetch(`/api/applications/${applicationId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setApplications((prev) =>
        prev.map((a) => (a.id === applicationId ? { ...a, stage_id: previousStageId } : a))
      );
      toast.error('Stufe konnte nicht geaendert werden');
    } else if (rejectionReason) {
      toast.success('Bewerber abgesagt');
    }
  }

  async function handleRejectionConfirm() {
    if (!rejectionModal) return;
    const reason = selectedReason === 'Sonstiges' ? customReason : selectedReason;
    if (!reason) return;
    setRejecting(true);
    await moveApplication(rejectionModal.applicationId, rejectionModal.stageId, rejectionModal.previousStageId, reason);
    setRejecting(false);
    setRejectionModal(null);
  }

  function handleCardClick(app: ApplicationRow) {
    window.location.href = `/candidates/${app.candidate_id}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  const filteredApps = applyApplicationFilters(applications, filters);

  return (
    <div>
      {!hideHeader && (
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
      )}

      <ApplicationFilterBar stages={stages} jobs={jobs} filters={filters} onChange={setFilters} />

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-0 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              applications={filteredApps.filter((a) => a.stage_id === stage.id)}
              onCardClick={handleCardClick}
            />
          ))}
        </div>
      </DndContext>

      {showAddModal && (
        <AddCandidateModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); loadData(); }}
        />
      )}

      <Modal open={!!rejectionModal} onClose={() => setRejectionModal(null)} title="Absagegrund" width="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Warum wird <strong>{rejectionModal?.candidateName}</strong> abgesagt?
          </p>
          <div className="space-y-2">
            {REJECTION_REASONS.map((reason) => (
              <label
                key={reason}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedReason === reason ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input type="radio" name="rejection_reason" value={reason} checked={selectedReason === reason}
                  onChange={() => setSelectedReason(reason)} className="sr-only" />
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
            <textarea value={customReason} onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Absagegrund eingeben..." rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none" />
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={() => setRejectionModal(null)}>Abbrechen</Button>
            <Button variant="primary" className="flex-1"
              disabled={!selectedReason || (selectedReason === 'Sonstiges' && !customReason.trim()) || rejecting}
              onClick={handleRejectionConfirm}>
              {rejecting ? 'Wird gespeichert...' : 'Absage bestaetigen'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
