'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import Link from 'next/link';
import {
  Sparkles, Check, ChevronDown, ChevronUp, Loader2,
  ListTodo, ExternalLink, RotateCcw,
} from 'lucide-react';

// ---- Types ----

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

interface TasksData {
  fulfillment: FulfillmentTask[];
  playbook: unknown[];
  recurring: unknown[];
  agencies: { id: string; name: string }[];
}

interface ContentLibraryItem {
  id: string;
  agency_id: string;
  content_type: string;
  title: string | null;
  content: string;
  status: string;
}

// ---- Constants ----

const AI_TASK_TYPES = [
  'ad_copy', 'phone_script', 'video_script', 'job_posting',
  'creative_brief', 'funnel_text', 'vg_leitfaden', 'follow_up', 'absage',
];

const MANUAL_TASK_TYPES = ['meta_upload', 'manual', 'funnel_publish', 'perspective_funnel'];

const REVIEW_CHECKLIST = [
  'Firmenname korrekt?',
  'Branche/Region passend?',
  'Tonalität professionell und motivierend?',
  'Keine Rechtschreibfehler?',
  'Call-to-Action vorhanden?',
  'Kontaktdaten/Links korrekt?',
];

function taskTypeLabel(type: string): string {
  const map: Record<string, string> = {
    ad_copy: 'Ad Copys generieren',
    phone_script: 'Telefonskript generieren',
    video_script: 'Video Ad Skripte',
    job_posting: 'Indeed-Anzeige',
    creative_brief: 'Creative Brief',
    funnel_text: 'Funnel-Texte',
    vg_leitfaden: 'VG Leitfaden',
    follow_up: 'Follow-Up',
    absage: 'Absage',
    meta_upload: 'Meta Zugang verifizieren',
    manual: 'Manuelle Aufgabe',
    funnel_publish: 'Funnel veröffentlichen',
    perspective_funnel: 'Perspective Funnel',
  };
  return map[type] ?? type;
}

// ---- Stat Card ----

function StatCard({ icon, label, value, tone = 'default' }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: 'default' | 'highlight' | 'success';
}) {
  const iconBg =
    tone === 'highlight' ? 'bg-red-100 text-red-600' :
    tone === 'success'   ? 'bg-green-100 text-green-600' :
    'bg-gray-100 text-gray-600';

  return (
    <Card padding="sm" className="flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </Card>
  );
}

// ---- Task Card (expandable) ----

interface TaskCardProps {
  task: FulfillmentTask;
  contentItem: ContentLibraryItem | null;
  onTaskUpdated: (taskId: string, newStatus: string) => void;
  onContentSaved: (item: ContentLibraryItem) => void;
}

function TaskCard({ task, contentItem, onTaskUpdated, onContentSaved }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [localContent, setLocalContent] = useState<ContentLibraryItem | null>(contentItem);
  const [checklist, setChecklist] = useState<boolean[]>(Array(6).fill(false));
  const [approving, setApproving] = useState(false);
  const [reviseFeedback, setReviseFeedback] = useState('');
  const [showRevise, setShowRevise] = useState(false);

  // Sync external content changes
  useEffect(() => {
    setLocalContent(contentItem);
  }, [contentItem]);

  const isAiTask = AI_TASK_TYPES.includes(task.task_type);
  const isManualTask = MANUAL_TASK_TYPES.includes(task.task_type) || (!isAiTask);
  const isPerspective = task.task_type === 'perspective_funnel';

  const effectiveStatus = task.status === 'review' || localContent !== null ? task.status : task.status;

  // Status badge config
  function statusBadge() {
    const s = task.status;
    if (s === 'done') return <Badge tone="success">Erledigt</Badge>;
    if (s === 'review') return <Badge tone="softAccent">Review ausstehend</Badge>;
    if (s === 'in_progress') return <Badge tone="neutral">Wird generiert…</Badge>;
    return <Badge tone="neutral">Ausstehend</Badge>;
  }

  async function handleGenerate(previousContent?: string, feedback?: string) {
    setGenerating(true);
    setShowRevise(false);
    setReviseFeedback('');
    try {
      const body: Record<string, unknown> = {
        type: task.task_type,
        agency_id: task.agency_id,
        fulfillment_task_id: task.id,
      };
      if (previousContent || feedback) {
        body.context = { previousVersion: previousContent, feedback };
      }

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Fehler beim Generieren');
      }

      const generated = await res.json();

      // Save to content library as draft
      const libRes = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agency_id: task.agency_id,
          content_type: task.task_type,
          title: taskTypeLabel(task.task_type),
          content: generated.content,
        }),
      });

      if (!libRes.ok) throw new Error('Fehler beim Speichern in der Library');
      const libItem: ContentLibraryItem = await libRes.json();

      // Update fulfillment task to review
      await fetch(`/api/fulfillment/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'review' }),
      });

      setLocalContent(libItem);
      onContentSaved(libItem);
      onTaskUpdated(task.id, 'review');
      setChecklist(Array(6).fill(false));
      setExpanded(true);
      toast.success('Inhalt generiert – bitte reviewen.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generierung fehlgeschlagen.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove() {
    if (!localContent) return;
    setApproving(true);
    try {
      // Approve content in library (draft → approved_internal so client can see it)
      const res = await fetch(`/api/library/${localContent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved_internal' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Fehler beim Freigeben');
      }

      // Mark fulfillment task as done
      await fetch(`/api/fulfillment/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });

      onTaskUpdated(task.id, 'done');
      setExpanded(false);
      toast.success('Inhalt freigegeben und Aufgabe erledigt.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Freigabe fehlgeschlagen.');
    } finally {
      setApproving(false);
    }
  }

  async function handleRevise() {
    if (!reviseFeedback.trim()) {
      toast.error('Bitte Feedback eingeben.');
      return;
    }
    await handleGenerate(localContent?.content, reviseFeedback.trim());
  }

  async function handleMarkDone() {
    try {
      await fetch(`/api/fulfillment/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      onTaskUpdated(task.id, 'done');
      toast.success('Aufgabe als erledigt markiert.');
    } catch {
      toast.error('Fehler beim Speichern.');
    }
  }

  const allChecked = checklist.every(Boolean);
  const isDone = task.status === 'done';
  const isInProgress = task.status === 'in_progress' || generating;

  return (
    <div className={`border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden transition-all ${isDone ? 'opacity-60' : ''}`}>
      {/* Collapsed header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Status icon */}
        <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
          {isDone ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : isInProgress ? (
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
          ) : task.status === 'review' ? (
            <div className="w-2 h-2 rounded-full bg-yellow-400" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-gray-300" />
          )}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-900 truncate block">
            {taskTypeLabel(task.task_type)}
          </span>
        </div>

        {/* Status badge */}
        <div className="flex-shrink-0 hidden sm:block">
          {statusBadge()}
        </div>

        {/* Action button */}
        <div className="flex-shrink-0">
          {isDone ? (
            <span className="text-green-600 text-sm font-medium flex items-center gap-1">
              <Check className="w-4 h-4" /> Erledigt
            </span>
          ) : isInProgress ? (
            <span className="text-gray-400 text-sm flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Wird generiert…
            </span>
          ) : task.status === 'review' ? (
            <Button
              variant="soft"
              size="sm"
              onClick={() => setExpanded((e) => !e)}
            >
              Review
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          ) : isAiTask ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleGenerate()}
              disabled={generating}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generieren
            </Button>
          ) : isPerspective ? (
            <Link href={`/clients/${task.agency_id}/perspective`}>
              <Button variant="ghost" size="sm">
                Zum Wizard
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </Link>
          ) : (
            <Button variant="soft" size="sm" onClick={handleMarkDone}>
              <Check className="w-3.5 h-3.5" />
              Erledigt
            </Button>
          )}
        </div>
      </div>

      {/* Expanded review panel */}
      {expanded && localContent && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-4">
          {/* Content preview */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Generierter Inhalt</p>
            <div className="bg-white border border-gray-200 rounded-lg p-4 max-h-72 overflow-y-auto">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                {localContent.content}
              </pre>
            </div>
          </div>

          {/* Checklist */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Review-Checkliste</p>
            <div className="space-y-2">
              {REVIEW_CHECKLIST.map((item, i) => (
                <label key={i} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={checklist[i]}
                    onChange={() => {
                      const next = [...checklist];
                      next[i] = !next[i];
                      setChecklist(next);
                    }}
                    className="w-4 h-4 accent-red-600 cursor-pointer"
                  />
                  <span className={`text-sm transition-colors ${checklist[i] ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                    {item}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Revise input */}
          {showRevise && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Feedback für Überarbeitung</p>
              <textarea
                value={reviseFeedback}
                onChange={(e) => setReviseFeedback(e.target.value)}
                placeholder="Was soll geändert werden?"
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={handleRevise} disabled={generating}>
                  {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Neu generieren
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowRevise(false); setReviseFeedback(''); }}>
                  Abbrechen
                </Button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {!showRevise && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <Button
                variant="primary"
                size="sm"
                disabled={!allChecked || approving}
                onClick={handleApprove}
              >
                {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Freigeben
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowRevise(true)}
                disabled={generating}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Überarbeiten
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(false)}
              >
                <ChevronUp className="w-3.5 h-3.5" />
                Zusammenklappen
              </Button>
            </div>
          )}

          {!allChecked && !showRevise && (
            <p className="text-xs text-gray-400">Alle 6 Punkte abhaken, um freizugeben.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Agency Group ----

interface AgencyGroupProps {
  agencyId: string;
  agencyName: string;
  tasks: FulfillmentTask[];
  contentByTaskId: Record<string, ContentLibraryItem>;
  onTaskUpdated: (taskId: string, newStatus: string) => void;
  onContentSaved: (item: ContentLibraryItem) => void;
}

function AgencyGroup({
  agencyId,
  agencyName,
  tasks,
  contentByTaskId,
  onTaskUpdated,
  onContentSaved,
}: AgencyGroupProps) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;

  return (
    <div className="space-y-2">
      {/* Agency header */}
      <div className="flex items-center justify-between mb-1">
        <Link
          href={`/clients/${agencyId}`}
          className="text-sm font-bold text-gray-900 hover:text-red-600 transition-colors flex items-center gap-1"
        >
          {agencyName}
          <ExternalLink className="w-3 h-3 text-gray-400" />
        </Link>
        <span className="text-xs text-gray-400 font-medium">{done}/{total} erledigt</span>
      </div>

      {/* Divider */}
      <div className="h-px bg-gray-200 mb-3" />

      {/* Task cards */}
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            contentItem={contentByTaskId[task.id] ?? null}
            onTaskUpdated={onTaskUpdated}
            onContentSaved={onContentSaved}
          />
        ))}
      </div>
    </div>
  );
}

// ---- Main page ----

export default function MeineAufgabenPage() {
  const [tasks, setTasks] = useState<FulfillmentTask[]>([]);
  const [contentMap, setContentMap] = useState<Record<string, ContentLibraryItem>>({}); // taskId → item
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/employee/tasks');
      const data: TasksData = await res.json();
      const allFulfillment: FulfillmentTask[] = data.fulfillment ?? [];
      setTasks(allFulfillment);

      // Fetch draft content library items for agencies with review tasks
      const reviewTasks = allFulfillment.filter((t) => t.status === 'review');
      const agencyIds = [...new Set(reviewTasks.map((t) => t.agency_id))];

      if (agencyIds.length > 0) {
        const libRes = await fetch(
          `/api/library?status=draft&agency_id=${agencyIds.join(',')}`
        );
        if (libRes.ok) {
          const items: ContentLibraryItem[] = await libRes.json();
          // Map by fulfillment task's content_type + agency_id → find best match per review task
          const newMap: Record<string, ContentLibraryItem> = {};
          for (const t of reviewTasks) {
            const match = items.find(
              (item) => item.agency_id === t.agency_id && item.content_type === t.task_type
            );
            if (match) newMap[t.id] = match;
          }
          setContentMap(newMap);
        }
      }
    } catch {
      toast.error('Aufgaben konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleTaskUpdated(taskId: string, newStatus: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
  }

  function handleContentSaved(item: ContentLibraryItem) {
    // Find the fulfillment task this content belongs to by agency + type
    setContentMap((prev) => {
      const matchingTask = tasks.find(
        (t) => t.agency_id === item.agency_id && t.task_type === item.content_type
      );
      if (!matchingTask) return prev;
      return { ...prev, [matchingTask.id]: item };
    });
  }

  // Derived stats
  const open = tasks.filter((t) => t.status !== 'done').length;
  const readyForReview = tasks.filter((t) => t.status === 'review').length;
  const approvedToday = tasks.filter((t) => t.status === 'done').length;

  // Group by agency, preserve sort_order within group
  const byAgency: Record<string, FulfillmentTask[]> = {};
  for (const t of tasks) {
    if (!byAgency[t.agency_id]) byAgency[t.agency_id] = [];
    byAgency[t.agency_id].push(t);
  }
  for (const id in byAgency) {
    byAgency[id].sort((a, b) => a.sort_order - b.sort_order);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        label="MEINE AUFGABEN"
        title="Meine Aufgaben"
        description="Alles auf einen Blick – generieren, reviewen, freigeben"
      />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={<ListTodo className="w-5 h-5" />}
          label="Offene Aufgaben"
          value={open}
          tone={open > 0 ? 'highlight' : 'default'}
        />
        <StatCard
          icon={<Sparkles className="w-5 h-5" />}
          label="Bereit zum Review"
          value={readyForReview}
          tone={readyForReview > 0 ? 'highlight' : 'default'}
        />
        <StatCard
          icon={<Check className="w-5 h-5" />}
          label="Erledigt"
          value={approvedToday}
          tone={approvedToday > 0 ? 'success' : 'default'}
        />
      </div>

      {/* Task list grouped by agency */}
      {Object.keys(byAgency).length === 0 ? (
        <Card padding="md">
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-semibold text-gray-900">Alles erledigt!</p>
            <p className="text-xs text-gray-500 mt-1">Keine offenen Aufgaben.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-10">
          {Object.entries(byAgency).map(([agencyId, agencyTasks]) => (
            <AgencyGroup
              key={agencyId}
              agencyId={agencyId}
              agencyName={agencyTasks[0]?.agency_name ?? agencyId}
              tasks={agencyTasks}
              contentByTaskId={contentMap}
              onTaskUpdated={handleTaskUpdated}
              onContentSaved={handleContentSaved}
            />
          ))}
        </div>
      )}
    </div>
  );
}
