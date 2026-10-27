'use client';

import { useEffect, useState, useCallback } from 'react';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Plus, Download } from 'lucide-react';
import { KanbanColumn } from './column';
import { AddCandidateModal } from './add-candidate-modal';
import { ApplicationFilterBar, applyApplicationFilters, type ApplicationFilters } from './filters';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import type { PipelineStage } from '@/lib/types/database';
import { toast } from 'sonner';
import { bewerberAbsagen, type AbsageErgebnis } from '@/components/candidates/absage-knopf';
import { AbsageDialog } from '@/components/candidates/absage-dialog';

export interface ApplicationRow {
  id: string;
  candidate_id: string;
  job_id: string;
  stage_id: string | null;
  source: string;
  score_label: string | null;
  applied_at: string;
  status: string;
  candidate: { id: string; name: string; phone: string | null; phone_e164: string | null; email: string | null; source: string; persona_typ?: string | null; persona_fit?: string | null };
  job: { id: string; title: string; slug: string };
  stage: { id: string; name: string; color: string; stage_type: string | null } | null;
}


export function KanbanBoard({ hideHeader }: { hideHeader?: boolean } = {}) {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState<ApplicationFilters>({
    search: '', source: '', stage: '', job: '', dateFrom: '', dateTo: '',
  });

  // Karte nach „Abgesagt“ gezogen → erst Absagegrund wählen
  const [absageFuer, setAbsageFuer] = useState<ApplicationRow | null>(null);
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
      setAbsageFuer(app);
      return;
    }

    await moveApplication(applicationId, newStageId, app.stage_id);
  }

  async function moveApplication(applicationId: string, newStageId: string, previousStageId: string | null) {
    setApplications((prev) =>
      prev.map((a) => (a.id === applicationId ? { ...a, stage_id: newStageId } : a))
    );

    const body: Record<string, string> = { stage_id: newStageId };

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
    }
  }

  // Absage über denselben Weg wie ✕: Grund speichern + Anrufe, Bot, Jobs und Termine stoppen
  async function handleRejectionConfirm(absage: { code: string; notiz: string | null }) {
    const app = absageFuer;
    if (!app || rejecting) return;
    setRejecting(true);
    const e = await bewerberAbsagen(app.candidate_id, absage, app.candidate.name, (r) => schnellWiederhergestellt(app, r));
    setRejecting(false);
    if (!e) return;
    setAbsageFuer(null);
    schnellAbgesagt(app, e);
  }

  // Schnell-Absage zieht alle Bewerbungen des Bewerbers in „Abgesagt“
  function schnellAbgesagt(app: ApplicationRow, e: AbsageErgebnis) {
    setApplications((prev) =>
      prev.map((a) => (a.candidate_id === app.candidate_id ? { ...a, stage_id: e.stageId, status: 'rejected' } : a))
    );
  }

  function schnellWiederhergestellt(app: ApplicationRow, e: AbsageErgebnis) {
    const vorher = new Map(e.rueckgaengig.bewerbungen.map((b) => [b.id, b]));
    setApplications((prev) =>
      prev.map((a) =>
        a.candidate_id === app.candidate_id
          ? { ...a, stage_id: vorher.get(a.id)?.stage_id ?? e.vorherStageId, status: vorher.get(a.id)?.status ?? 'open' }
          : a
      )
    );
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
              onAbgesagt={schnellAbgesagt}
              onWiederhergestellt={schnellWiederhergestellt}
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

      <AbsageDialog
        open={!!absageFuer}
        name={absageFuer?.candidate.name}
        laeuft={rejecting}
        onClose={() => setAbsageFuer(null)}
        onBestaetigt={(a) => void handleRejectionConfirm(a)}
      />
    </div>
  );
}
