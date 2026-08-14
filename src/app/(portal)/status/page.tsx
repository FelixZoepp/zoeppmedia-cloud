'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import type { FulfillmentTask, ContentLibraryItem } from '@/lib/types/database';
import {
  Check, Clock, Loader2, FileText, ThumbsUp, ThumbsDown, AlertTriangle,
} from 'lucide-react';

// ─── Pipeline stage definitions ────────────────────────────────────────────

type StageId = 'onboarding' | 'content' | 'approval' | 'campaign' | 'live';
type StageStatus = 'done' | 'in_progress' | 'waiting' | 'pending';

interface PipelineStageConfig {
  id: StageId;
  title: string;
  description: string;
  taskTypes?: FulfillmentTask['task_type'][];
}

const PIPELINE_STAGES: PipelineStageConfig[] = [
  {
    id: 'onboarding',
    title: 'Onboarding abgeschlossen',
    description: 'Deine Daten sind bei uns eingegangen',
  },
  {
    id: 'content',
    title: 'Content wird erstellt',
    description: 'Wir erstellen Anzeigen, Skripte und Funnel für dich',
    taskTypes: ['ad_copy', 'phone_script', 'video_script', 'job_posting', 'creative_brief'],
  },
  {
    id: 'approval',
    title: 'Deine Freigabe',
    description: 'Prüfe und gib die erstellten Inhalte frei',
  },
  {
    id: 'campaign',
    title: 'Funnel & Kampagne',
    description: 'Wir bauen den Funnel und starten die Kampagne',
    taskTypes: ['perspective_funnel', 'meta_upload', 'funnel_publish', 'manual'],
  },
  {
    id: 'live',
    title: 'Kampagne läuft',
    description: 'Bewerber kommen rein — check dein Dashboard',
  },
];

// Labels shown for each task type in the pipeline sub-items
const TASK_TYPE_LABELS: Partial<Record<FulfillmentTask['task_type'], string>> = {
  ad_copy: 'Ad Copys',
  phone_script: 'Telefon-Skripte',
  video_script: 'Video-Skript',
  job_posting: 'Indeed-Anzeige',
  creative_brief: 'Creative Brief',
  perspective_funnel: 'Perspective Funnel',
  meta_upload: 'Meta Kampagne hochladen',
  funnel_publish: 'Funnel veröffentlichen',
  manual: 'Manueller Schritt',
  script: 'Skript',
  meta_campaign: 'Meta Kampagne',
  other: 'Weitere Aufgabe',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeStageStatus(
  stageId: StageId,
  config: PipelineStageConfig,
  tasks: FulfillmentTask[],
  contentItems: ContentLibraryItem[],
  onboardingDone: boolean,
): StageStatus {
  if (stageId === 'onboarding') {
    return onboardingDone ? 'done' : 'in_progress';
  }

  if (stageId === 'approval') {
    if (contentItems.length === 0) return 'pending';
    return 'waiting';
  }

  if (stageId === 'live') {
    const campaignConfig = PIPELINE_STAGES.find((s) => s.id === 'campaign');
    const campaignTasks = tasks.filter((t) => campaignConfig?.taskTypes?.includes(t.task_type));
    if (campaignTasks.length > 0 && campaignTasks.every((t) => t.status === 'done' || t.status === 'skipped')) {
      return 'done';
    }
    return 'pending';
  }

  const stageTasks = tasks.filter((t) => config.taskTypes?.includes(t.task_type));
  if (stageTasks.length === 0) return 'pending';

  const allDone = stageTasks.every((t) => t.status === 'done' || t.status === 'skipped');
  if (allDone) return 'done';

  const anyActive = stageTasks.some((t) => t.status === 'in_progress' || t.status === 'review');
  if (anyActive) return 'in_progress';

  // If at least one is done/skipped but not all — still in progress
  const anyDone = stageTasks.some((t) => t.status === 'done' || t.status === 'skipped');
  if (anyDone) return 'in_progress';

  return 'pending';
}

function computeOverallProgress(
  tasks: FulfillmentTask[],
  contentItems: ContentLibraryItem[],
  onboardingDone: boolean,
): number {
  // Weight: onboarding = 1 point, each fulfillment task = 1 point, each approved content = 0.5 point
  let total = 1 + tasks.length; // onboarding + tasks
  let done = onboardingDone ? 1 : 0;
  done += tasks.filter((t) => t.status === 'done' || t.status === 'skipped').length;

  if (total === 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

function getTaskStatusIcon(status: FulfillmentTask['status']) {
  if (status === 'done' || status === 'skipped') {
    return <Check className="w-4 h-4 text-green-500 flex-shrink-0" />;
  }
  if (status === 'in_progress' || status === 'review') {
    return <Loader2 className="w-4 h-4 text-red-500 animate-spin flex-shrink-0" />;
  }
  return <Clock className="w-4 h-4 text-gray-300 flex-shrink-0" />;
}

function getTaskStatusLabel(status: FulfillmentTask['status']) {
  switch (status) {
    case 'done': return 'Erledigt';
    case 'skipped': return 'Übersprungen';
    case 'in_progress': return 'Wird erstellt...';
    case 'review': return 'In Prüfung';
    default: return 'Ausstehend';
  }
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface StepCircleProps {
  status: StageStatus;
  isLast: boolean;
}

function StepConnector({ status }: { status: StageStatus }) {
  if (status === 'done') {
    return <div className="w-0.5 flex-1 bg-green-500 min-h-[2rem]" />;
  }
  if (status === 'in_progress' || status === 'waiting') {
    return (
      <div
        className="w-0.5 flex-1 min-h-[2rem]"
        style={{
          background: 'linear-gradient(to bottom, #ef4444 0%, #e5e7eb 100%)',
        }}
      />
    );
  }
  return <div className="w-0.5 flex-1 bg-gray-200 min-h-[2rem]" />;
}

function StepCircle({ status, isLast }: StepCircleProps) {
  return (
    <div className="flex flex-col items-center flex-shrink-0">
      {status === 'done' ? (
        <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white shadow-sm">
          <Check className="w-5 h-5" />
        </div>
      ) : status === 'in_progress' ? (
        <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white shadow-sm animate-pulse">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : status === 'waiting' ? (
        <div className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center text-white shadow-sm">
          <AlertTriangle className="w-5 h-5" />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
          <Clock className="w-5 h-5" />
        </div>
      )}
      {!isLast && <StepConnector status={status} />}
    </div>
  );
}

interface PipelineStepProps {
  config: PipelineStageConfig;
  status: StageStatus;
  tasks: FulfillmentTask[];
  contentItems: ContentLibraryItem[];
  isLast: boolean;
  onApproveContent: (id: string) => void;
  onRequestChanges: (id: string, title: string) => void;
  submitting: boolean;
}

function PipelineStep({
  config, status, tasks, contentItems, isLast,
  onApproveContent, onRequestChanges, submitting,
}: PipelineStepProps) {
  const stageTasks = config.taskTypes
    ? tasks.filter((t) => config.taskTypes!.includes(t.task_type))
    : [];

  const doneCount = stageTasks.filter((t) => t.status === 'done' || t.status === 'skipped').length;

  const headerColor =
    status === 'done' ? 'text-gray-900'
      : status === 'in_progress' ? 'text-gray-900'
        : status === 'waiting' ? 'text-gray-900'
          : 'text-gray-400';

  const subColor =
    status === 'done' ? 'text-green-600'
      : status === 'in_progress' ? 'text-gray-500'
        : status === 'waiting' ? 'text-amber-600'
          : 'text-gray-300';

  let subtitle = '';
  if (status === 'done') subtitle = 'Erledigt';
  else if (status === 'in_progress') subtitle = stageTasks.length > 0 ? `${doneCount} von ${stageTasks.length} fertig` : 'In Bearbeitung';
  else if (status === 'waiting') subtitle = `${contentItems.length} ${contentItems.length === 1 ? 'Inhalt wartet' : 'Inhalte warten'} auf dich`;
  else subtitle = 'Ausstehend';

  return (
    <div className="flex gap-4">
      <StepCircle status={status} isLast={isLast} />

      <div className={`pb-8 flex-1 min-w-0 ${isLast ? '' : ''}`}>
        <h3 className={`font-semibold text-base leading-tight ${headerColor}`}>
          {config.title}
        </h3>
        <p className={`text-sm mt-0.5 ${subColor}`}>
          {subtitle}
        </p>
        {status !== 'pending' && config.description && (
          <p className="text-xs text-gray-400 mt-0.5">{config.description}</p>
        )}

        {/* Sub-tasks for content/campaign stages */}
        {stageTasks.length > 0 && (status === 'in_progress' || status === 'done') && (
          <div className="mt-3 space-y-1.5">
            {stageTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 text-sm">
                {getTaskStatusIcon(task.status)}
                <span className={
                  task.status === 'done' || task.status === 'skipped'
                    ? 'text-gray-500'
                    : task.status === 'in_progress' || task.status === 'review'
                      ? 'text-red-600'
                      : 'text-gray-400'
                }>
                  {task.title || TASK_TYPE_LABELS[task.task_type] || task.task_type}
                </span>
                {(task.status === 'in_progress' || task.status === 'review') && (
                  <span className="text-xs text-gray-400">{getTaskStatusLabel(task.status)}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Approval stage — show content items inline */}
        {config.id === 'approval' && status === 'waiting' && contentItems.length > 0 && (
          <div className="mt-3 space-y-2">
            {contentItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-900 truncate">{item.title}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRequestChanges(item.id, item.title)}
                    disabled={submitting}
                    className="h-7 text-xs px-2"
                  >
                    <ThumbsDown className="w-3 h-3" />
                    Änderung
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onApproveContent(item.id)}
                    disabled={submitting}
                    className="h-7 text-xs px-2"
                  >
                    <ThumbsUp className="w-3 h-3" />
                    Freigeben
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Progress Hero ───────────────────────────────────────────────────────────

function ProgressHero({ percent, activeStage }: { percent: number; activeStage: PipelineStageConfig | undefined }) {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (percent / 100) * circumference;

  const statusText =
    percent === 100
      ? 'Kampagne läuft — alles erledigt!'
      : activeStage?.id === 'onboarding'
        ? 'Dein Projekt wird vorbereitet'
        : activeStage?.id === 'content'
          ? 'Content wird erstellt'
          : activeStage?.id === 'approval'
            ? 'Deine Freigabe ist gefragt'
            : activeStage?.id === 'campaign'
              ? 'Kampagne wird aufgebaut'
              : activeStage?.id === 'live'
                ? 'Kampagne läuft'
                : 'Wird vorbereitet...';

  return (
    <Card padding="lg" className="mb-8">
      <div className="flex items-center gap-8">
        {/* Circular progress */}
        <div className="relative flex-shrink-0 w-24 h-24">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50" cy="50" r="40"
              fill="none"
              stroke="#f3f4f6"
              strokeWidth="10"
            />
            <circle
              cx="50" cy="50" r="40"
              fill="none"
              stroke={percent === 100 ? '#22c55e' : '#ef4444'}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-extrabold text-gray-900">{percent}%</span>
          </div>
        </div>

        {/* Status text */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Projektstatus</p>
          <h2 className="text-xl font-bold text-gray-900 leading-tight">{statusText}</h2>
          {activeStage && (
            <p className="text-sm text-gray-500 mt-1">{activeStage.description}</p>
          )}
          {/* Linear progress bar */}
          <div className="mt-4 w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${percent === 100 ? 'bg-green-500' : 'bg-red-500'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">{percent}% abgeschlossen</p>
        </div>
      </div>
    </Card>
  );
}

// ─── Content Full Review Section ─────────────────────────────────────────────

interface ContentReviewSectionProps {
  items: ContentLibraryItem[];
  onApprove: (id: string) => void;
  onRequestChanges: (id: string, title: string) => void;
  onPreview: (item: ContentLibraryItem) => void;
  submitting: boolean;
}

function ContentReviewSection({ items, onApprove, onRequestChanges, onPreview, submitting }: ContentReviewSectionProps) {
  if (items.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
          <FileText className="w-4 h-4 text-amber-600" />
        </div>
        <h2 className="text-sm font-bold text-gray-900">Inhalte zur Freigabe</h2>
        <span className="text-xs text-gray-400 font-medium ml-1">({items.length})</span>
      </div>

      <div className="space-y-4">
        {items.map((item) => (
          <Card key={item.id} padding="md" className="border-l-4 border-l-amber-400">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0">
                <FileText className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {item.content.slice(0, 120)}{item.content.length > 120 ? '...' : ''}
                  </p>
                  <button
                    onClick={() => onPreview(item)}
                    className="text-xs text-red-600 hover:text-red-700 font-medium mt-1 cursor-pointer"
                  >
                    Vorschau ansehen
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRequestChanges(item.id, item.title)}
                  disabled={submitting}
                >
                  <ThumbsDown className="w-3.5 h-3.5" /> Änderungen anfordern
                </Button>
                <Button
                  size="sm"
                  onClick={() => onApprove(item.id)}
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
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ProjectStatusPage() {
  const [fulfillmentTasks, setFulfillmentTasks] = useState<FulfillmentTask[]>([]);
  const [contentItems, setContentItems] = useState<ContentLibraryItem[]>([]);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [loading, setLoading] = useState(true);

  const [feedbackModal, setFeedbackModal] = useState<{ id: string; title: string } | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [contentPreview, setContentPreview] = useState<ContentLibraryItem | null>(null);

  const fetchData = useCallback(async () => {
    const [fulfillmentRes, contentRes, sopRes] = await Promise.all([
      fetch('/api/fulfillment?agency_id=me'),
      fetch('/api/library?agency_id=me&status=approved_internal,client_review'),
      fetch('/api/sop?agency_id=me'),
    ]);

    const tasks: FulfillmentTask[] = await fulfillmentRes.json().catch(() => []);
    const content: ContentLibraryItem[] = await contentRes.json().catch(() => []);
    const sop = await sopRes.json().catch(() => null);

    setFulfillmentTasks(Array.isArray(tasks) ? tasks : []);
    setContentItems(Array.isArray(content) ? content : []);

    // Onboarding is done if customerSop exists
    setOnboardingDone(!!sop?.customerSop);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Compute stage statuses ──
  const stageStatuses: Record<StageId, StageStatus> = {} as Record<StageId, StageStatus>;
  for (const stage of PIPELINE_STAGES) {
    stageStatuses[stage.id] = computeStageStatus(
      stage.id, stage, fulfillmentTasks, contentItems, onboardingDone,
    );
  }

  // Active stage = first non-done stage
  const activeStage = PIPELINE_STAGES.find((s) => stageStatuses[s.id] !== 'done');
  const overallPercent = computeOverallProgress(fulfillmentTasks, contentItems, onboardingDone);

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        label="PROJEKT"
        title="Projektstatus"
        description="Dein aktueller Fortschritt auf einen Blick"
      />

      {/* Hero progress circle */}
      <ProgressHero percent={overallPercent} activeStage={activeStage} />

      {/* Vertical pipeline */}
      <Card padding="lg" className="mb-2">
        <h2 className="text-sm font-bold text-gray-900 mb-6">Dein Weg zur Kampagne</h2>
        <div>
          {PIPELINE_STAGES.map((stage, idx) => (
            <PipelineStep
              key={stage.id}
              config={stage}
              status={stageStatuses[stage.id]}
              tasks={fulfillmentTasks}
              contentItems={stage.id === 'approval' ? contentItems : []}
              isLast={idx === PIPELINE_STAGES.length - 1}
              onApproveContent={approveContent}
              onRequestChanges={(id, title) => setFeedbackModal({ id, title })}
              submitting={submitting}
            />
          ))}
        </div>
      </Card>

      {/* Full content review cards (below pipeline) */}
      <ContentReviewSection
        items={contentItems}
        onApprove={approveContent}
        onRequestChanges={(id, title) => setFeedbackModal({ id, title })}
        onPreview={setContentPreview}
        submitting={submitting}
      />

      {/* Feedback Modal */}
      <Modal
        open={feedbackModal !== null}
        onClose={() => { setFeedbackModal(null); setFeedbackText(''); }}
        title="Änderung anfordern"
      >
        {feedbackModal && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Was sollen wir bei <strong>{feedbackModal.title}</strong> ändern?
            </p>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Beschreibe kurz, was geändert werden soll..."
              rows={4}
              className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setFeedbackModal(null); setFeedbackText(''); }}>
                Abbrechen
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!feedbackText.trim()) return;
                  requestContentChanges(feedbackModal.id, feedbackText);
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
        title={contentPreview?.title ?? 'Vorschau'}
        width="max-w-2xl"
      >
        {contentPreview && (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 max-h-80 overflow-y-auto">
              <pre className="text-sm text-gray-900 whitespace-pre-wrap font-sans leading-relaxed">
                {contentPreview.content}
              </pre>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFeedbackModal({ id: contentPreview.id, title: contentPreview.title });
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
