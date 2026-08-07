'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { SopPhase, SopTask, CustomerSop, CustomerTask } from '@/lib/types/database';
import { PageHeader } from '@/components/ui/page-header';
import {
  ArrowLeft, ChevronDown, ChevronRight, Check, Clock, Eye,
  Play, Sparkles, Send, SkipForward, AlertTriangle, Loader2,
} from 'lucide-react';

type TaskStatus = CustomerTask['status'];

const statusConfig: Record<TaskStatus, { label: string; tone: 'neutral' | 'softAccent' | 'accent' | 'success' | 'outline'; icon: React.ReactNode }> = {
  pending:            { label: 'Ausstehend',        tone: 'neutral',    icon: <Clock className="w-3.5 h-3.5" /> },
  in_progress:        { label: 'In Arbeit',         tone: 'softAccent', icon: <Play className="w-3.5 h-3.5" /> },
  waiting_approval:   { label: 'Warte auf Freigabe', tone: 'accent',    icon: <Eye className="w-3.5 h-3.5" /> },
  approved:           { label: 'Freigegeben',       tone: 'success',    icon: <Check className="w-3.5 h-3.5" /> },
  changes_requested:  { label: 'Anderung nötig',    tone: 'outline',    icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  done:               { label: 'Erledigt',           tone: 'success',    icon: <Check className="w-3.5 h-3.5" /> },
  skipped:            { label: 'Übersprungen',       tone: 'outline',    icon: <SkipForward className="w-3.5 h-3.5" /> },
};

const taskTypeLabels: Record<SopTask['task_type'], string> = {
  manual: 'Manuell',
  ai_generate: 'AI',
  approval: 'Freigabe',
  external: 'Extern',
};

interface SopData {
  phases: SopPhase[];
  tasks: SopTask[];
  customerSop: CustomerSop | null;
  customerTasks: CustomerTask[];
}

export default function SopPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [noteModal, setNoteModal] = useState<{ taskId: string; currentNotes: string } | null>(null);
  const [noteText, setNoteText] = useState('');

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/sop?agency_id=${id}`);
    const json: SopData = await res.json();
    setData(json);
    setLoading(false);

    // Auto-expand phases that have in-progress or attention-needed tasks
    if (json.customerSop) {
      const tasksByPhase = new Map<string, CustomerTask[]>();
      for (const ct of json.customerTasks) {
        const sopTask = json.tasks.find((t) => t.id === ct.sop_task_id);
        if (sopTask) {
          const existing = tasksByPhase.get(sopTask.phase_id) || [];
          existing.push(ct);
          tasksByPhase.set(sopTask.phase_id, existing);
        }
      }
      const toExpand = new Set<string>();
      for (const [phaseId, phaseTasks] of tasksByPhase) {
        const hasActive = phaseTasks.some((t) =>
          ['in_progress', 'waiting_approval', 'changes_requested'].includes(t.status)
        );
        if (hasActive) toExpand.add(phaseId);
      }
      // If nothing active, expand first incomplete phase
      if (toExpand.size === 0 && json.phases.length > 0) {
        for (const phase of json.phases) {
          const phaseTasks = tasksByPhase.get(phase.id) || [];
          const allDone = phaseTasks.length > 0 && phaseTasks.every((t) => t.status === 'done' || t.status === 'skipped');
          if (!allDone) {
            toExpand.add(phase.id);
            break;
          }
        }
      }
      setExpandedPhases(toExpand);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function initializeSop() {
    setInitializing(true);
    await fetch('/api/sop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agency_id: id }),
    });
    await fetchData();
    setInitializing(false);
  }

  async function updateTaskStatus(customerTaskId: string, status: TaskStatus, feedback?: string) {
    await fetch(`/api/sop/tasks/${customerTaskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, feedback }),
    });
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        customerTasks: prev.customerTasks.map((ct) =>
          ct.id === customerTaskId
            ? { ...ct, status, updated_at: new Date().toISOString(), completed_at: status === 'done' ? new Date().toISOString() : ct.completed_at }
            : ct
        ),
      };
    });
  }

  async function updateTaskNotes(customerTaskId: string, notes: string) {
    await fetch(`/api/sop/tasks/${customerTaskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, status: undefined }),
    });
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        customerTasks: prev.customerTasks.map((ct) =>
          ct.id === customerTaskId ? { ...ct, notes } : ct
        ),
      };
    });
    setNoteModal(null);
    setNoteText('');
  }

  async function generateContent(sopTask: SopTask, customerTaskId: string) {
    setGenerating(customerTaskId);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: sopTask.ai_content_type || 'ad_copy',
          agency_id: id,
        }),
      });
      const generated = await res.json();

      // Save to content library
      await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agency_id: id,
          content_type: sopTask.ai_content_type || 'ad_copy',
          title: sopTask.title,
          content: generated.content,
          variant: 'V1',
          version: 1,
          status: 'pending_review',
        }),
      });

      // Mark task as waiting_approval
      await updateTaskStatus(customerTaskId, 'waiting_approval');
    } finally {
      setGenerating(null);
    }
  }

  function togglePhase(phaseId: string) {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card padding="lg" className="text-center">
        <p className="text-[var(--text-secondary)]">Daten konnten nicht geladen werden.</p>
      </Card>
    );
  }

  const { phases, tasks, customerSop, customerTasks } = data;

  // Build lookup: sop_task_id -> customerTask
  const customerTaskMap = new Map<string, CustomerTask>();
  for (const ct of customerTasks) {
    customerTaskMap.set(ct.sop_task_id, ct);
  }

  // Group tasks by phase
  const tasksByPhase = new Map<string, SopTask[]>();
  for (const task of tasks) {
    const existing = tasksByPhase.get(task.phase_id) || [];
    existing.push(task);
    tasksByPhase.set(task.phase_id, existing);
  }

  // Calculate overall progress
  const totalTasks = customerTasks.length;
  const doneTasks = customerTasks.filter((t) => t.status === 'done' || t.status === 'skipped').length;
  const overallPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="max-w-4xl">
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-red-500 text-[13px] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Zuruck zum Kunden
      </Link>

      <PageHeader
        label="FULFILLMENT"
        title="SOP"
        description={
          customerSop
            ? `${doneTasks} von ${totalTasks} Aufgaben erledigt \u00B7 ${overallPercent}%`
            : 'SOP wurde noch nicht gestartet'
        }
        action={
          <div className="flex items-center gap-4">
            {customerSop && (
              <div className="w-32 h-2.5 bg-[var(--surface-inset)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#EF5B6F] to-red-500 rounded-full transition-all duration-500"
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
            )}
            {!customerSop && (
              <Button onClick={initializeSop} disabled={initializing}>
                {initializing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Wird erstellt...
                  </>
                ) : (
                  'SOP starten'
                )}
              </Button>
            )}
          </div>
        }
      />

      {customerSop && (
        <Link
          href={`/clients/${id}/library`}
          className="inline-flex items-center gap-1.5 text-red-500 hover:text-red-600 text-[13px] font-medium mb-8 transition-colors"
        >
          Content-Bibliothek ansehen &rarr;
        </Link>
      )}

      <div className="space-y-5">
        {phases.map((phase, phaseIndex) => {
          const phaseTasks = tasksByPhase.get(phase.id) || [];
          const phaseCustomerTasks = phaseTasks
            .map((t) => customerTaskMap.get(t.id))
            .filter(Boolean) as CustomerTask[];
          const phaseDone = phaseCustomerTasks.filter((ct) => ct.status === 'done' || ct.status === 'skipped').length;
          const phaseTotal = phaseCustomerTasks.length;
          const phasePercent = phaseTotal > 0 ? Math.round((phaseDone / phaseTotal) * 100) : 0;
          const isExpanded = expandedPhases.has(phase.id);
          const hasAttention = phaseCustomerTasks.some((ct) =>
            ['waiting_approval', 'changes_requested'].includes(ct.status)
          );
          const allComplete = phaseTotal > 0 && phaseDone === phaseTotal;

          return (
            <Card key={phase.id} padding="sm" className="overflow-hidden">
              {/* Phase header */}
              <button
                onClick={() => togglePhase(phase.id)}
                className="w-full flex items-center gap-4 p-4 text-left cursor-pointer hover:bg-gray-025 rounded-[var(--radius-lg)] transition-colors"
              >
                <div className={`w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0 font-bold text-[15px] ${
                  allComplete
                    ? 'bg-green-100 text-green-700'
                    : hasAttention
                      ? 'bg-amber-100 text-amber-500'
                      : 'bg-red-50 text-red-500'
                }`}>
                  {allComplete ? <Check className="w-5 h-5" /> : phaseIndex + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-[15px] text-[var(--text-primary)]">
                      Phase {phaseIndex + 1}: {phase.title}
                    </h3>
                    {hasAttention && (
                      <Badge tone="accent">Aktion nötig</Badge>
                    )}
                  </div>
                  {phase.description && (
                    <p className="text-[13px] text-[var(--text-secondary)] mt-0.5 truncate">
                      {phase.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {customerSop && (
                    <>
                      <span className="text-[13px] text-[var(--text-secondary)] font-medium">
                        {phaseDone}/{phaseTotal}
                      </span>
                      <div className="w-20 h-1.5 bg-[var(--surface-inset)] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            allComplete ? 'bg-green-500' : 'bg-gradient-to-r from-[#EF5B6F] to-red-500'
                          }`}
                          style={{ width: `${phasePercent}%` }}
                        />
                      </div>
                    </>
                  )}
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-[var(--text-tertiary)]" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-[var(--text-tertiary)]" />
                  )}
                </div>
              </button>

              {/* Expanded task list */}
              {isExpanded && (
                <div className="px-4 pb-4">
                  <div className="border-t border-[var(--border-default)] pt-3 space-y-2">
                    {phaseTasks.map((sopTask) => {
                      const ct = customerTaskMap.get(sopTask.id);
                      const status: TaskStatus = ct?.status || 'pending';
                      const config = statusConfig[status];
                      const isAiTask = sopTask.task_type === 'ai_generate';
                      const isGenerating = generating === ct?.id;

                      return (
                        <div
                          key={sopTask.id}
                          className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] hover:bg-gray-025 transition-colors group"
                        >
                          {/* Status icon */}
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                            status === 'done' ? 'bg-green-100 text-green-700'
                              : status === 'skipped' ? 'bg-gray-100 text-gray-400'
                                : status === 'waiting_approval' ? 'bg-red-50 text-red-500'
                                  : status === 'in_progress' ? 'bg-red-50 text-red-400'
                                    : status === 'changes_requested' ? 'bg-amber-100 text-amber-500'
                                      : status === 'approved' ? 'bg-green-100 text-green-700'
                                        : 'bg-gray-100 text-gray-400'
                          }`}>
                            {status === 'done' || status === 'approved' ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : status === 'in_progress' ? (
                              <Play className="w-3 h-3" />
                            ) : status === 'waiting_approval' ? (
                              <Eye className="w-3.5 h-3.5" />
                            ) : status === 'changes_requested' ? (
                              <AlertTriangle className="w-3.5 h-3.5" />
                            ) : status === 'skipped' ? (
                              <SkipForward className="w-3 h-3" />
                            ) : (
                              <div className="w-2 h-2 rounded-full bg-gray-300" />
                            )}
                          </div>

                          {/* Task info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[14px] font-medium ${
                                status === 'done' || status === 'skipped'
                                  ? 'text-[var(--text-tertiary)] line-through'
                                  : 'text-[var(--text-primary)]'
                              }`}>
                                {sopTask.title}
                              </span>
                              {isAiTask && (
                                <span className="text-[11px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                                  AI
                                </span>
                              )}
                              {sopTask.task_type !== 'manual' && sopTask.task_type !== 'ai_generate' && (
                                <span className="text-[11px] font-medium text-[var(--text-tertiary)] bg-gray-100 px-1.5 py-0.5 rounded">
                                  {taskTypeLabels[sopTask.task_type]}
                                </span>
                              )}
                            </div>
                            {sopTask.description && (
                              <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5 truncate">
                                {sopTask.description}
                              </p>
                            )}
                            {ct?.notes && (
                              <p className="text-[12px] text-[var(--text-secondary)] mt-1 italic">
                                Notiz: {ct.notes}
                              </p>
                            )}
                          </div>

                          {/* Status badge */}
                          {ct && (
                            <Badge tone={config.tone} className="flex-shrink-0">
                              {config.icon}
                              <span className="ml-1">{config.label}</span>
                            </Badge>
                          )}

                          {/* Action buttons */}
                          {ct && (
                            <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              {/* Pending -> Start */}
                              {status === 'pending' && (
                                <Button variant="ghost" size="sm" onClick={() => updateTaskStatus(ct.id, 'in_progress')}>
                                  <Play className="w-3.5 h-3.5" /> Start
                                </Button>
                              )}

                              {/* In progress -> AI Generate (if AI task) */}
                              {isAiTask && (status === 'pending' || status === 'in_progress' || status === 'changes_requested') && (
                                <Button
                                  variant="soft"
                                  size="sm"
                                  onClick={() => generateContent(sopTask, ct.id)}
                                  disabled={isGenerating}
                                >
                                  {isGenerating ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Sparkles className="w-3.5 h-3.5" />
                                  )}
                                  {isGenerating ? 'Generiert...' : 'Generieren'}
                                </Button>
                              )}

                              {/* In progress -> Submit for approval (if requires_approval) */}
                              {status === 'in_progress' && sopTask.requires_approval && (
                                <Button variant="secondary" size="sm" onClick={() => updateTaskStatus(ct.id, 'waiting_approval')}>
                                  <Send className="w-3.5 h-3.5" /> Zur Freigabe
                                </Button>
                              )}

                              {/* In progress -> Done (if no approval needed) */}
                              {status === 'in_progress' && !sopTask.requires_approval && (
                                <Button variant="secondary" size="sm" onClick={() => updateTaskStatus(ct.id, 'done')}>
                                  <Check className="w-3.5 h-3.5" /> Fertig
                                </Button>
                              )}

                              {/* Approved -> Done */}
                              {status === 'approved' && (
                                <Button variant="secondary" size="sm" onClick={() => updateTaskStatus(ct.id, 'done')}>
                                  <Check className="w-3.5 h-3.5" /> Abschliessen
                                </Button>
                              )}

                              {/* Changes requested -> resubmit */}
                              {status === 'changes_requested' && !isAiTask && (
                                <Button variant="soft" size="sm" onClick={() => updateTaskStatus(ct.id, 'waiting_approval')}>
                                  <Send className="w-3.5 h-3.5" /> Erneut einreichen
                                </Button>
                              )}

                              {/* Skip option for non-critical tasks */}
                              {(status === 'pending' || status === 'in_progress') && (
                                <Button variant="ghost" size="sm" onClick={() => updateTaskStatus(ct.id, 'skipped')}>
                                  <SkipForward className="w-3.5 h-3.5" />
                                </Button>
                              )}

                              {/* Notes button */}
                              <button
                                onClick={() => {
                                  setNoteModal({ taskId: ct.id, currentNotes: ct.notes || '' });
                                  setNoteText(ct.notes || '');
                                }}
                                className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors px-1"
                                title="Notizen"
                              >
                                ...
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {phaseTasks.length === 0 && (
                      <p className="text-[13px] text-[var(--text-tertiary)] py-3 text-center">
                        Keine Aufgaben in dieser Phase
                      </p>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {phases.length === 0 && (
          <Card padding="lg" className="text-center">
            <p className="text-[var(--text-secondary)]">
              Keine SOP-Phasen konfiguriert. Bitte erstelle die SOP-Vorlage zuerst.
            </p>
          </Card>
        )}
      </div>

      {/* Notes Modal */}
      <Modal
        open={noteModal !== null}
        onClose={() => { setNoteModal(null); setNoteText(''); }}
        title="Notizen"
      >
        <div className="space-y-5">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Notizen zu dieser Aufgabe..."
            rows={4}
            className="w-full px-4 py-3 text-[15px] border border-[var(--border-default)] rounded-[var(--radius-md)] bg-white text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 resize-none"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setNoteModal(null); setNoteText(''); }}>
              Abbrechen
            </Button>
            <Button
              size="sm"
              onClick={() => noteModal && updateTaskNotes(noteModal.taskId, noteText)}
            >
              Speichern
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
