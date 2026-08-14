'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { ReviewModal } from '@/components/review-modal';
import Link from 'next/link';
import {
  FolderKanban, FileText, PhoneCall, Target, MoreHorizontal,
  Check, Clock, Play, Sparkles, Upload, Rocket, Video,
  Briefcase, Megaphone, ChevronDown, ChevronUp, Calendar,
  BookOpen, RefreshCw, ListTodo,
} from 'lucide-react';

// ---- Types ----

interface Agency {
  id: string;
  name: string;
}

interface FulfillmentTask {
  id: string;
  agency_id: string;
  agency_name: string;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  sort_order: number;
}

interface PlaybookTask {
  id: string;
  agency_id: string | null;
  agency_name: string | null;
  action_text: string;
  playbook_key: string;
  status: string;
  notes: string | null;
}

interface RecurringTask {
  id: string;
  agency_id: string;
  agency_name: string;
  title: string;
  task_key: string;
  status: string;
  due_date: string | null;
}

interface TasksData {
  fulfillment: FulfillmentTask[];
  playbook: PlaybookTask[];
  recurring: RecurringTask[];
  agencies: Agency[];
}

// ---- Constants ----

const AI_TYPES = ['ad_copy', 'phone_script', 'video_script', 'job_posting', 'creative_brief'];

const taskIcons: Record<string, React.ReactNode> = {
  perspective_funnel: <FolderKanban className="w-4 h-4" />,
  ad_copy: <FileText className="w-4 h-4" />,
  phone_script: <PhoneCall className="w-4 h-4" />,
  video_script: <Video className="w-4 h-4" />,
  job_posting: <Briefcase className="w-4 h-4" />,
  creative_brief: <Megaphone className="w-4 h-4" />,
  meta_upload: <Upload className="w-4 h-4" />,
  funnel_publish: <Rocket className="w-4 h-4" />,
  script: <PhoneCall className="w-4 h-4" />,
  meta_campaign: <Target className="w-4 h-4" />,
  manual: <Clock className="w-4 h-4" />,
};

const statusConfig: Record<string, { label: string; tone: 'neutral' | 'softAccent' | 'accent' | 'success' | 'outline' }> = {
  pending: { label: 'Ausstehend', tone: 'neutral' },
  in_progress: { label: 'In Arbeit', tone: 'softAccent' },
  review: { label: 'Review', tone: 'accent' },
  done: { label: 'Erledigt', tone: 'success' },
  skipped: { label: 'Übersprungen', tone: 'outline' },
};

// ---- Section wrapper ----

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-red-600">{icon}</span>
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <span className="text-sm text-gray-400 ml-1">{count}</span>
    </div>
  );
}

// ---- Main page ----

export default function MeineAufgabenPage() {
  const [data, setData] = useState<TasksData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fulfillment AI generate state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewContent, setReviewContent] = useState('');
  const [reviewTask, setReviewTask] = useState<FulfillmentTask | null>(null);

  // Playbook expand/edit state
  const [expandedPlaybook, setExpandedPlaybook] = useState<string | null>(null);
  const [playbookNotes, setPlaybookNotes] = useState<Record<string, string>>({});
  const [playbookSaving, setPlaybookSaving] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/employee/tasks')
      .then((r) => r.json())
      .then((d: TasksData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---- Fulfillment helpers ----

  function updateFulfillmentStatus(taskId: string, status: string) {
    fetch(`/api/fulfillment/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fulfillment: status === 'done'
          ? prev.fulfillment.filter((t) => t.id !== taskId)
          : prev.fulfillment.map((t) => (t.id === taskId ? { ...t, status } : t)),
      };
    });
  }

  async function generateContent(task: FulfillmentTask) {
    setActionLoading(task.id);
    updateFulfillmentStatus(task.id, 'in_progress');

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: task.task_type,
          agency_id: task.agency_id,
          fulfillment_task_id: task.id,
        }),
      });

      if (res.ok) {
        const d = await res.json();
        setReviewTask(task);
        setReviewContent(d.content ?? '');
        setReviewOpen(true);
      } else {
        updateFulfillmentStatus(task.id, 'pending');
        toast.error('Generierung fehlgeschlagen.');
      }
    } catch {
      updateFulfillmentStatus(task.id, 'pending');
      toast.error('Generierung fehlgeschlagen.');
    } finally {
      setActionLoading(null);
    }
  }

  function handleReviewApprove() {
    if (!reviewTask) return;
    updateFulfillmentStatus(reviewTask.id, 'review');
    setReviewOpen(false);
    setReviewTask(null);
    setReviewContent('');
  }

  async function handleReviewRevise(feedback: string) {
    if (!reviewTask) return;
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: reviewTask.task_type,
        agency_id: reviewTask.agency_id,
        fulfillment_task_id: reviewTask.id,
        feedback,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setReviewContent(d.content ?? '');
    }
  }

  function handleReviewDiscard() {
    if (!reviewTask) return;
    updateFulfillmentStatus(reviewTask.id, 'pending');
    setReviewOpen(false);
    setReviewTask(null);
    setReviewContent('');
  }

  function getFulfillmentAction(task: FulfillmentTask) {
    const isLoading = actionLoading === task.id;

    if (task.task_type === 'perspective_funnel') {
      return (
        <Link href={`/clients/${task.agency_id}/perspective`}>
          <Button variant="primary" size="sm">
            <FolderKanban className="w-3.5 h-3.5" />
            Funnel Wizard
          </Button>
        </Link>
      );
    }

    if (AI_TYPES.includes(task.task_type) && task.status === 'pending') {
      return (
        <Button variant="primary" size="sm" onClick={() => generateContent(task)} disabled={isLoading}>
          <Sparkles className="w-3.5 h-3.5" />
          {isLoading ? 'Generiert...' : 'Generieren'}
        </Button>
      );
    }

    if (task.task_type === 'meta_upload' && task.status === 'pending') {
      return (
        <Link href={`/clients/${task.agency_id}/fulfillment`}>
          <Button variant="primary" size="sm">
            <Upload className="w-3.5 h-3.5" />
            Meta Upload
          </Button>
        </Link>
      );
    }

    if (task.task_type === 'funnel_publish' && task.status === 'pending') {
      return (
        <Link href={`/clients/${task.agency_id}/fulfillment`}>
          <Button variant="primary" size="sm">
            <Rocket className="w-3.5 h-3.5" />
            Funnel veröffentlichen
          </Button>
        </Link>
      );
    }

    if (task.task_type === 'manual' && task.status === 'pending') {
      return (
        <Button variant="soft" size="sm" onClick={() => updateFulfillmentStatus(task.id, 'done')}>
          <Check className="w-3.5 h-3.5" />
          Erledigt
        </Button>
      );
    }

    return null;
  }

  // ---- Playbook helpers ----

  async function updatePlaybookStatus(taskId: string, status: string) {
    setPlaybookSaving(taskId);
    try {
      await fetch(`/api/playbook-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          playbook: status === 'done'
            ? prev.playbook.filter((t) => t.id !== taskId)
            : prev.playbook.map((t) => (t.id === taskId ? { ...t, status } : t)),
        };
      });
    } finally {
      setPlaybookSaving(null);
    }
  }

  async function savePlaybookNotes(task: PlaybookTask) {
    setPlaybookSaving(task.id);
    try {
      await fetch(`/api/playbook-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: playbookNotes[task.id] ?? task.notes ?? '' }),
      });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          playbook: prev.playbook.map((t) =>
            t.id === task.id ? { ...t, notes: playbookNotes[task.id] ?? t.notes } : t
          ),
        };
      });
      toast.success('Notizen gespeichert.');
    } finally {
      setPlaybookSaving(null);
    }
  }

  // ---- Recurring helpers ----

  async function markRecurringDone(taskId: string) {
    await fetch(`/api/fulfillment/recurring/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, recurring: prev.recurring.filter((t) => t.id !== taskId) };
    });
  }

  // ---- Derived ----

  const totalOpen = data
    ? data.fulfillment.length + data.playbook.length + data.recurring.length
    : 0;

  // Group fulfillment tasks by agency
  const fulfillmentByAgency: Record<string, FulfillmentTask[]> = {};
  for (const task of data?.fulfillment ?? []) {
    if (!fulfillmentByAgency[task.agency_id]) fulfillmentByAgency[task.agency_id] = [];
    fulfillmentByAgency[task.agency_id].push(task);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-10">
      <PageHeader
        label="MEINE AUFGABEN"
        title="Meine Aufgaben"
        description="Deine offenen Aufgaben für heute"
        counter={totalOpen > 0 ? `${totalOpen} offen` : undefined}
      />

      {/* ---- Section 1: Fulfillment ---- */}
      <section>
        <SectionHeader
          icon={<ListTodo className="w-5 h-5" />}
          title="Fulfillment"
          count={data?.fulfillment.length ?? 0}
        />

        {(data?.fulfillment.length ?? 0) === 0 ? (
          <Card padding="md">
            <p className="text-sm text-gray-400 text-center">Keine offenen Fulfillment-Aufgaben.</p>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(fulfillmentByAgency).map(([agencyId, tasks]) => {
              const agencyName = tasks[0]?.agency_name ?? agencyId;
              return (
                <div key={agencyId}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
                    {agencyName}
                  </p>
                  <div className="space-y-2">
                    {tasks.map((task) => {
                      const config = statusConfig[task.status] ?? statusConfig.pending;
                      const actionBtn = getFulfillmentAction(task);
                      return (
                        <Card key={task.id} padding="sm" className="flex items-center gap-4">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            task.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'
                          }`}>
                            {taskIcons[task.task_type] ?? <MoreHorizontal className="w-4 h-4" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gray-900">{task.title}</p>
                            {task.description && (
                              <p className="text-xs text-gray-500 truncate">{task.description}</p>
                            )}
                          </div>

                          <Badge tone={config.tone}>{config.label}</Badge>

                          <div className="flex items-center gap-2 shrink-0">
                            {actionBtn}
                            {!actionBtn && task.status === 'pending' && (
                              <Button variant="ghost" size="sm" onClick={() => updateFulfillmentStatus(task.id, 'in_progress')}>
                                <Play className="w-3.5 h-3.5" /> Start
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Section 2: Playbook ---- */}
      <section>
        <SectionHeader
          icon={<BookOpen className="w-5 h-5" />}
          title="Playbook"
          count={data?.playbook.length ?? 0}
        />

        {(data?.playbook.length ?? 0) === 0 ? (
          <Card padding="md">
            <p className="text-sm text-gray-400 text-center">Keine offenen Playbook-Aufgaben.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {data?.playbook.map((task) => {
              const isExpanded = expandedPlaybook === task.id;
              const isSaving = playbookSaving === task.id;

              return (
                <Card key={task.id} padding="sm">
                  {/* Header row */}
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => setExpandedPlaybook(isExpanded ? null : task.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 leading-snug">{task.action_text}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge tone="softAccent" className="font-mono">
                          {task.playbook_key}
                        </Badge>
                        {task.agency_name && (
                          <Badge tone="neutral">{task.agency_name}</Badge>
                        )}
                        <Badge tone={task.status === 'in_progress' ? 'accent' : 'neutral'}>
                          {task.status === 'in_progress' ? 'In Bearbeitung' : 'Offen'}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {task.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); updatePlaybookStatus(task.id, 'in_progress'); }}
                          disabled={isSaving}
                        >
                          <Play className="w-3.5 h-3.5" /> Start
                        </Button>
                      )}
                      <Button
                        variant="soft"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); updatePlaybookStatus(task.id, 'done'); }}
                        disabled={isSaving}
                      >
                        <Check className="w-3.5 h-3.5" /> Erledigt
                      </Button>
                      {isExpanded
                        ? <ChevronUp className="w-4 h-4 text-gray-400" />
                        : <ChevronDown className="w-4 h-4 text-gray-400" />
                      }
                    </div>
                  </div>

                  {/* Expanded: notes */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                      <textarea
                        rows={3}
                        placeholder="Notizen..."
                        className="w-full text-sm text-gray-900 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                        value={playbookNotes[task.id] ?? task.notes ?? ''}
                        onChange={(e) =>
                          setPlaybookNotes((prev) => ({ ...prev, [task.id]: e.target.value }))
                        }
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => savePlaybookNotes(task)}
                        disabled={isSaving}
                      >
                        {isSaving ? 'Speichert...' : 'Speichern'}
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Section 3: Recurring ---- */}
      <section>
        <SectionHeader
          icon={<RefreshCw className="w-5 h-5" />}
          title="Recurring"
          count={data?.recurring.length ?? 0}
        />

        {(data?.recurring.length ?? 0) === 0 ? (
          <Card padding="md">
            <p className="text-sm text-gray-400 text-center">Keine anstehenden Recurring-Aufgaben.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {data?.recurring.map((task) => (
              <Card key={task.id} padding="sm" className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                  <RefreshCw className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{task.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{task.agency_name}</p>
                </div>

                <Badge tone="neutral">{task.task_key}</Badge>

                {task.due_date && (
                  <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                    <Calendar className="w-3 h-3" />
                    {new Date(task.due_date).toLocaleDateString('de-DE')}
                  </div>
                )}

                <Button variant="soft" size="sm" onClick={() => markRecurringDone(task.id)}>
                  <Check className="w-3.5 h-3.5" /> Erledigt
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Review Modal */}
      <ReviewModal
        open={reviewOpen}
        onClose={handleReviewDiscard}
        content={reviewContent}
        contentType={reviewTask?.task_type ?? ''}
        agencyId={reviewTask?.agency_id ?? ''}
        taskId={reviewTask?.id}
        onApprove={handleReviewApprove}
        onRevise={handleReviewRevise}
        onDiscard={handleReviewDiscard}
      />
    </div>
  );
}
