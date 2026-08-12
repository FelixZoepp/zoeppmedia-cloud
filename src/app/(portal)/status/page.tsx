'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { SopPhase, SopTask, CustomerSop, CustomerTask, ContentLibraryItem } from '@/lib/types/database';
import { PageHeader } from '@/components/ui/page-header';
import {
  Check, Clock, Eye, AlertTriangle, ChevronDown, ChevronRight,
  MessageSquare, ThumbsUp, ThumbsDown, FileText,
} from 'lucide-react';

type TaskStatus = CustomerTask['status'];

const clientStatusConfig: Record<TaskStatus, { label: string; icon: React.ReactNode; show: boolean }> = {
  pending:            { label: 'Ausstehend',        icon: <Clock className="w-3.5 h-3.5 text-gray-400" />,  show: false },
  in_progress:        { label: 'In Bearbeitung',    icon: <Clock className="w-3.5 h-3.5 text-red-400" />,   show: true },
  waiting_approval:   { label: 'Ihre Freigabe nötig', icon: <AlertTriangle className="w-3.5 h-3.5 text-red-500" />, show: true },
  approved:           { label: 'Freigegeben',       icon: <Check className="w-3.5 h-3.5 text-green-600" />, show: true },
  changes_requested:  { label: 'Änderung angefragt', icon: <Clock className="w-3.5 h-3.5 text-amber-500" />, show: true },
  done:               { label: 'Erledigt',           icon: <Check className="w-3.5 h-3.5 text-green-600" />, show: true },
  skipped:            { label: 'Übersprungen',       icon: <Check className="w-3.5 h-3.5 text-gray-400" />,  show: false },
};

interface SopData {
  phases: SopPhase[];
  tasks: SopTask[];
  customerSop: CustomerSop | null;
  customerTasks: CustomerTask[];
}

export default function ProjectStatusPage() {
  const [sopData, setSopData] = useState<SopData | null>(null);
  const [contentItems, setContentItems] = useState<ContentLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [feedbackModal, setFeedbackModal] = useState<{ type: 'task' | 'content'; id: string; title: string } | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [contentPreview, setContentPreview] = useState<ContentLibraryItem | null>(null);

  const fetchData = useCallback(async () => {
    const [sopRes, contentRes] = await Promise.all([
      fetch('/api/sop?agency_id=me'),
      fetch('/api/library?agency_id=me&status=approved_internal,client_review'),
    ]);

    const sop: SopData = await sopRes.json();
    let content: ContentLibraryItem[] = [];
    try {
      content = await contentRes.json();
      if (!Array.isArray(content)) content = [];
    } catch {
      content = [];
    }

    setSopData(sop);
    setContentItems(content);
    setLoading(false);

    // Auto-expand phases with approval-needed items
    if (sop.customerSop) {
      const toExpand = new Set<string>();
      for (const ct of sop.customerTasks) {
        if (ct.status === 'waiting_approval') {
          const sopTask = sop.tasks.find((t) => t.id === ct.sop_task_id);
          if (sopTask) toExpand.add(sopTask.phase_id);
        }
      }
      setExpandedPhases(toExpand);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function approveTask(customerTaskId: string) {
    setSubmitting(true);
    await fetch(`/api/sop/tasks/${customerTaskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    setSopData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        customerTasks: prev.customerTasks.map((ct) =>
          ct.id === customerTaskId ? { ...ct, status: 'approved' as TaskStatus } : ct
        ),
      };
    });
    setSubmitting(false);
  }

  async function requestTaskChanges(customerTaskId: string, feedback: string) {
    setSubmitting(true);
    await fetch(`/api/sop/tasks/${customerTaskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'changes_requested', feedback }),
    });
    setSopData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        customerTasks: prev.customerTasks.map((ct) =>
          ct.id === customerTaskId ? { ...ct, status: 'changes_requested' as TaskStatus } : ct
        ),
      };
    });
    setSubmitting(false);
    setFeedbackModal(null);
    setFeedbackText('');
  }

  async function approveContent(contentId: string) {
    setSubmitting(true);
    await fetch(`/api/library/${contentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    setContentItems((prev) => prev.filter((c) => c.id !== contentId));
    if (contentPreview?.id === contentId) setContentPreview(null);
    setSubmitting(false);
  }

  async function requestContentChanges(contentId: string, feedback: string) {
    setSubmitting(true);
    await fetch(`/api/library/${contentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'changes_requested', client_feedback: feedback }),
    });
    setContentItems((prev) => prev.filter((c) => c.id !== contentId));
    if (contentPreview?.id === contentId) setContentPreview(null);
    setSubmitting(false);
    setFeedbackModal(null);
    setFeedbackText('');
  }

  function togglePhase(phaseId: string) {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
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

  if (!sopData?.customerSop) {
    return (
      <div className="max-w-4xl mx-auto">
        <PageHeader label="PROJEKT" title="Projektstatus" />
        <Card padding="lg" className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-[17px] font-bold text-[var(--text-primary)] mb-2">
            Ihr Projekt wird vorbereitet
          </h2>
          <p className="text-[var(--text-secondary)]">
            Wir richten gerade alles für Sie ein. Sobald Ihr Projekt gestartet wurde, sehen Sie hier den aktuellen Fortschritt.
          </p>
        </Card>
      </div>
    );
  }

  const { phases, tasks, customerTasks } = sopData;

  // Build lookup maps
  const customerTaskMap = new Map<string, CustomerTask>();
  for (const ct of customerTasks) {
    customerTaskMap.set(ct.sop_task_id, ct);
  }

  const tasksByPhase = new Map<string, SopTask[]>();
  for (const task of tasks) {
    const existing = tasksByPhase.get(task.phase_id) || [];
    existing.push(task);
    tasksByPhase.set(task.phase_id, existing);
  }

  // Calculate overall progress
  const totalTasks = customerTasks.length;
  const doneTasks = customerTasks.filter((t) => t.status === 'done' || t.status === 'skipped' || t.status === 'approved').length;
  const overallPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Determine current phase
  let currentPhaseIndex = 0;
  for (let i = 0; i < phases.length; i++) {
    const phaseTasks = tasksByPhase.get(phases[i].id) || [];
    const phaseCTs = phaseTasks.map((t) => customerTaskMap.get(t.id)).filter(Boolean) as CustomerTask[];
    const allDone = phaseCTs.length > 0 && phaseCTs.every((ct) => ct.status === 'done' || ct.status === 'skipped' || ct.status === 'approved');
    if (allDone) {
      currentPhaseIndex = i + 1;
    } else {
      break;
    }
  }
  const currentPhaseDisplay = Math.min(currentPhaseIndex + 1, phases.length);

  // Items needing attention
  const approvalTasks = customerTasks.filter((ct) => ct.status === 'waiting_approval');
  const needsAttention = approvalTasks.length;
  // Content items for client review (approved_internal or client_review)
  const contentForReview = contentItems;

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        label="PROJEKT"
        title="Projektstatus"
        description={`Phase ${currentPhaseDisplay} von ${phases.length} \u2014 ${overallPercent}% erledigt`}
      />

      {/* Overall progress */}
      <Card padding="lg" className="mb-10">
        <div className="flex items-center justify-between mb-5">
          <span className="text-[15px] font-bold text-[var(--text-primary)]">Gesamtfortschritt</span>
          <span className="text-[22px] font-extrabold text-red-500">{overallPercent}%</span>
        </div>
        <div className="w-full h-3 bg-[var(--surface-inset)] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#EF5B6F] to-red-500 rounded-full transition-all duration-700"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
        <div className="flex justify-between mt-3">
          <span className="text-[13px] text-[var(--text-tertiary)]">{doneTasks} von {totalTasks} Aufgaben</span>
          {(needsAttention + contentForReview.length) > 0 && (
            <span className="text-[13px] font-medium text-red-500">
              {needsAttention + contentForReview.length} {(needsAttention + contentForReview.length) === 1 ? 'Punkt braucht' : 'Punkte brauchen'} Ihre Aufmerksamkeit
            </span>
          )}
        </div>
      </Card>

      {/* Attention needed section — SOP tasks only */}
      {needsAttention > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <h2 className="text-[15px] font-bold text-[var(--text-primary)]">
              Ihre Freigabe wird benötigt
            </h2>
          </div>

          <div className="space-y-8">
            {approvalTasks.map((ct) => {
              const sopTask = tasks.find((t) => t.id === ct.sop_task_id);
              if (!sopTask) return null;

              return (
                <Card key={ct.id} padding="md" className="border-l-4 border-l-red-500">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-5">
                      <Eye className="w-5 h-5 text-red-500 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-[15px] text-[var(--text-primary)]">{sopTask.title}</p>
                        {sopTask.description && (
                          <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">{sopTask.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFeedbackModal({ type: 'task', id: ct.id, title: sopTask.title })}
                        disabled={submitting}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" /> Änderung
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => approveTask(ct.id)}
                        disabled={submitting}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" /> Freigeben
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Phase cards */}
      <div className="space-y-8">
        {phases.map((phase, phaseIndex) => {
          const phaseTasks = tasksByPhase.get(phase.id) || [];
          const phaseCTs = phaseTasks.map((t) => customerTaskMap.get(t.id)).filter(Boolean) as CustomerTask[];
          const phaseDone = phaseCTs.filter((ct) => ct.status === 'done' || ct.status === 'skipped' || ct.status === 'approved').length;
          const phaseTotal = phaseCTs.length;
          const phasePercent = phaseTotal > 0 ? Math.round((phaseDone / phaseTotal) * 100) : 0;
          const allComplete = phaseTotal > 0 && phaseDone === phaseTotal;
          const isExpanded = expandedPhases.has(phase.id);
          const hasApprovalNeeded = phaseCTs.some((ct) => ct.status === 'waiting_approval');

          return (
            <Card key={phase.id} padding="sm">
              <button
                onClick={() => togglePhase(phase.id)}
                className="w-full flex items-center gap-4 p-5 text-left cursor-pointer hover:bg-gray-025 rounded-[var(--radius-lg)] transition-colors"
              >
                {/* Phase number/check */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-[15px] ${
                  allComplete
                    ? 'bg-green-100 text-green-700'
                    : phaseIndex < currentPhaseIndex
                      ? 'bg-green-100 text-green-700'
                      : phaseIndex === currentPhaseIndex
                        ? 'bg-red-50 text-red-500'
                        : 'bg-gray-100 text-gray-400'
                }`}>
                  {allComplete || phaseIndex < currentPhaseIndex ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    phaseIndex + 1
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-[15px] text-[var(--text-primary)]">
                      {phase.title}
                    </h3>
                    {hasApprovalNeeded && (
                      <Badge tone="accent">Freigabe nötig</Badge>
                    )}
                  </div>
                  {phase.description && (
                    <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
                      {phase.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-4 flex-shrink-0">
                  <span className="text-[13px] text-[var(--text-tertiary)] font-medium">
                    {phasePercent}%
                  </span>
                  <div className="w-16 h-1.5 bg-[var(--surface-inset)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        allComplete ? 'bg-green-500' : 'bg-gradient-to-r from-[#EF5B6F] to-red-500'
                      }`}
                      style={{ width: `${phasePercent}%` }}
                    />
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
                  )}
                </div>
              </button>

              {/* Expanded simple task list */}
              {isExpanded && (
                <div className="px-5 pb-5">
                  <div className="border-t border-[var(--border-default)] pt-4 space-y-2">
                    {phaseTasks.map((sopTask) => {
                      const ct = customerTaskMap.get(sopTask.id);
                      const status: TaskStatus = ct?.status || 'pending';
                      const config = clientStatusConfig[status];

                      // Don't show pending/skipped tasks to clients to keep it simple
                      if (!config.show && status !== 'pending') return null;

                      return (
                        <div
                          key={sopTask.id}
                          className="flex items-center gap-4 py-3 px-4 rounded-[var(--radius-sm)]"
                        >
                          {config.icon}
                          <span className={`text-[14px] flex-1 ${
                            status === 'done' || status === 'approved'
                              ? 'text-[var(--text-tertiary)]'
                              : status === 'waiting_approval'
                                ? 'text-[var(--text-primary)] font-medium'
                                : 'text-[var(--text-secondary)]'
                          }`}>
                            {sopTask.title}
                          </span>
                          <span className={`text-[12px] font-medium ${
                            status === 'done' || status === 'approved'
                              ? 'text-green-600'
                              : status === 'waiting_approval'
                                ? 'text-red-500'
                                : status === 'in_progress'
                                  ? 'text-red-400'
                                  : status === 'changes_requested'
                                    ? 'text-amber-500'
                                    : 'text-[var(--text-tertiary)]'
                          }`}>
                            {config.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Content review section */}
      {contentForReview.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
              <FileText className="w-4 h-4 text-red-500" />
            </div>
            <h2 className="text-[15px] font-bold text-[var(--text-primary)]">
              Inhalte zur Freigabe
            </h2>
            <span className="text-[13px] text-[var(--text-tertiary)] font-medium ml-1">
              ({contentForReview.length})
            </span>
          </div>

          <div className="space-y-8">
            {contentForReview.map((item) => (
              <Card key={item.id} padding="md" className="border-l-4 border-l-red-500">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-5 min-w-0">
                    <FileText className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-semibold text-[15px] text-[var(--text-primary)]">{item.title}</p>
                      <p className="text-[13px] text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                        {item.content.slice(0, 120)}{item.content.length > 120 ? '...' : ''}
                      </p>
                      <button
                        onClick={() => setContentPreview(item)}
                        className="text-[13px] text-red-500 hover:text-red-600 font-medium mt-1 cursor-pointer"
                      >
                        Vorschau ansehen
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFeedbackModal({ type: 'content', id: item.id, title: item.title })}
                      disabled={submitting}
                    >
                      <ThumbsDown className="w-3.5 h-3.5" /> Änderungen anfordern
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => approveContent(item.id)}
                      disabled={submitting}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" /> Freigeben
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      <Modal
        open={feedbackModal !== null}
        onClose={() => { setFeedbackModal(null); setFeedbackText(''); }}
        title="Änderung anfordern"
      >
        {feedbackModal && (
          <div className="space-y-8">
            <p className="text-[14px] text-[var(--text-secondary)]">
              Was sollen wir bei <strong>{feedbackModal.title}</strong> andern?
            </p>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Beschreiben Sie kurz, was geandert werden soll..."
              rows={4}
              className="w-full px-4 py-3 text-[15px] border border-[var(--border-default)] rounded-[var(--radius-md)] bg-white text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setFeedbackModal(null); setFeedbackText(''); }}>
                Abbrechen
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!feedbackText.trim()) return;
                  if (feedbackModal.type === 'task') {
                    requestTaskChanges(feedbackModal.id, feedbackText);
                  } else {
                    requestContentChanges(feedbackModal.id, feedbackText);
                  }
                }}
                disabled={!feedbackText.trim() || submitting}
              >
                {submitting ? 'Wird gesendet...' : 'Absenden'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Content Preview Modal */}
      <Modal
        open={contentPreview !== null}
        onClose={() => setContentPreview(null)}
        title={contentPreview?.title || 'Vorschau'}
        width="max-w-2xl"
      >
        {contentPreview && (
          <div className="space-y-5">
            <div className="bg-gray-025 border border-gray-100 rounded-[var(--radius-md)] p-5 max-h-80 overflow-y-auto">
              <pre className="text-[14px] text-[var(--text-primary)] whitespace-pre-wrap font-[var(--font-ui)] leading-relaxed">
                {contentPreview.content}
              </pre>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-default)]">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFeedbackModal({ type: 'content', id: contentPreview.id, title: contentPreview.title });
                  setContentPreview(null);
                }}
              >
                <ThumbsDown className="w-3.5 h-3.5" /> Änderung anfordern
              </Button>
              <Button
                size="sm"
                onClick={() => approveContent(contentPreview.id)}
                disabled={submitting}
              >
                <ThumbsUp className="w-3.5 h-3.5" /> Freigeben
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
