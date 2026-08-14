'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import {
  FolderKanban, FileText, PhoneCall, Target, MoreHorizontal,
  Check, Clock, Eye, Play, ArrowLeft, Sparkles, Upload, Rocket,
  Video, Briefcase, Megaphone, RotateCcw, X,
} from 'lucide-react';
import Link from 'next/link';

const taskIcons: Record<string, React.ReactNode> = {
  perspective_funnel: <FolderKanban className="w-5 h-5" />,
  ad_copy: <FileText className="w-5 h-5" />,
  phone_script: <PhoneCall className="w-5 h-5" />,
  video_script: <Video className="w-5 h-5" />,
  job_posting: <Briefcase className="w-5 h-5" />,
  creative_brief: <Megaphone className="w-5 h-5" />,
  meta_upload: <Upload className="w-5 h-5" />,
  funnel_publish: <Rocket className="w-5 h-5" />,
  script: <PhoneCall className="w-5 h-5" />,
  meta_campaign: <Target className="w-5 h-5" />,
  manual: <Clock className="w-5 h-5" />,
  other: <MoreHorizontal className="w-5 h-5" />,
};

const statusConfig: Record<string, { label: string; tone: 'neutral' | 'softAccent' | 'accent' | 'success' | 'outline' }> = {
  pending: { label: 'Ausstehend', tone: 'neutral' },
  in_progress: { label: 'In Arbeit', tone: 'softAccent' },
  review: { label: 'Review', tone: 'accent' },
  done: { label: 'Erledigt', tone: 'success' },
  skipped: { label: 'Übersprungen', tone: 'outline' },
};

const AI_TYPES = ['ad_copy', 'phone_script', 'video_script', 'job_posting', 'creative_brief'];

const REVIEW_QUESTIONS = [
  'Firmenname korrekt?',
  'Branche/Region passend?',
  'Tonalität professionell und motivierend?',
  'Keine Rechtschreibfehler?',
  'Call-to-Action vorhanden?',
  'Kontaktdaten/Links korrekt?',
];

interface FulfillmentTask {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  sort_order: number;
}

export default function FulfillmentPage() {
  const { id } = useParams<{ id: string }>();
  const [tasks, setTasks] = useState<FulfillmentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Review flow state
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewContent, setReviewContent] = useState('');
  const [reviewTask, setReviewTask] = useState<FulfillmentTask | null>(null);
  const [reviewChecks, setReviewChecks] = useState<boolean[]>(REVIEW_QUESTIONS.map(() => false));
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewRevising, setReviewRevising] = useState(false);

  useEffect(() => {
    fetch(`/api/fulfillment?agency_id=${id}`)
      .then((r) => r.json())
      .then((data) => {
        setTasks(data);
        setLoading(false);
      });
  }, [id]);

  async function updateStatus(taskId: string, status: string) {
    await fetch(`/api/fulfillment/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
  }

  async function generateContent(task: FulfillmentTask) {
    setActionLoading(task.id);
    await updateStatus(task.id, 'in_progress');

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: task.task_type,
          agency_id: id,
          fulfillment_task_id: task.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.content ?? '';
        // Open the review modal instead of saving immediately
        setReviewTask(task);
        setReviewContent(content);
        setReviewChecks(REVIEW_QUESTIONS.map(() => false));
        setReviewOpen(true);
      } else {
        await updateStatus(task.id, 'pending');
      }
    } catch {
      await updateStatus(task.id, 'pending');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReviewApprove() {
    if (!reviewTask) return;
    setReviewSaving(true);

    try {
      // Save generated content to library with status 'internal_review'
      await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agency_id: id,
          content_type: reviewTask.task_type,
          title: reviewTask.title,
          content: reviewContent,
          status: 'internal_review',
        }),
      });
      await updateStatus(reviewTask.id, 'review');
      setReviewOpen(false);
      setReviewTask(null);
      setReviewContent('');
    } finally {
      setReviewSaving(false);
    }
  }

  async function handleReviewRevise() {
    if (!reviewTask) return;
    setReviewRevising(true);

    // Build feedback from unchecked items
    const issues = REVIEW_QUESTIONS.filter((_, i) => !reviewChecks[i]);
    const feedback = `Bitte überarbeite: ${issues.join(', ')}`;

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: reviewTask.task_type,
          agency_id: id,
          fulfillment_task_id: reviewTask.id,
          feedback,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setReviewContent(data.content ?? '');
        setReviewChecks(REVIEW_QUESTIONS.map(() => false));
      }
    } finally {
      setReviewRevising(false);
    }
  }

  async function handleReviewDiscard() {
    if (!reviewTask) return;
    await updateStatus(reviewTask.id, 'pending');
    setReviewOpen(false);
    setReviewTask(null);
    setReviewContent('');
  }

  function toggleCheck(index: number) {
    setReviewChecks((prev) => prev.map((c, i) => (i === index ? !c : c)));
  }

  const allChecked = reviewChecks.every(Boolean);

  async function uploadToMeta(task: FulfillmentTask) {
    setActionLoading(task.id);
    await updateStatus(task.id, 'in_progress');

    try {
      // Fetch approved ad copy from content library
      const contentRes = await fetch(`/api/library?agency_id=${id}&content_type=ad_copy&status=approved`);
      const contents = await contentRes.json();
      const approved = Array.isArray(contents) ? contents[0] : null;

      if (!approved) {
        toast.error('Bitte zuerst Ad Copys generieren und freigeben lassen.');
        await updateStatus(task.id, 'pending');
        return;
      }

      const res = await fetch('/api/meta/upload-ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agency_id: id,
          headline: approved.title,
          body: approved.content,
          link_url: '',
        }),
      });

      if (res.ok) {
        await updateStatus(task.id, 'done');
      } else {
        const err = await res.json();
        toast.error(`Fehler beim Meta-Upload: ${err.error ?? 'Unbekannter Fehler'}`);
        await updateStatus(task.id, 'pending');
      }
    } catch {
      await updateStatus(task.id, 'pending');
    } finally {
      setActionLoading(null);
    }
  }

  async function publishFunnel(task: FulfillmentTask) {
    setActionLoading(task.id);
    await updateStatus(task.id, 'in_progress');

    try {
      const res = await fetch('/api/perspective/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency_id: id }),
      });

      if (res.ok) {
        const data = await res.json();
        if (!data.published) {
          toast.error(data.message);
        }
        await updateStatus(task.id, 'done');
      } else {
        const err = await res.json();
        toast.error(`Fehler beim Veröffentlichen: ${err.error ?? 'Unbekannter Fehler'}`);
        await updateStatus(task.id, 'pending');
      }
    } catch {
      await updateStatus(task.id, 'pending');
    } finally {
      setActionLoading(null);
    }
  }

  function getActionButton(task: FulfillmentTask) {
    const isLoading = actionLoading === task.id;

    if (task.task_type === 'perspective_funnel') {
      return (
        <Link href={`/clients/${id}/perspective`}>
          <Button variant="primary" size="sm">
            <FolderKanban className="w-3.5 h-3.5" />
            Funnel Wizard
          </Button>
        </Link>
      );
    }

    if (AI_TYPES.includes(task.task_type) && task.status === 'pending') {
      return (
        <Button
          variant="primary"
          size="sm"
          onClick={() => generateContent(task)}
          disabled={isLoading}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {isLoading ? 'Generiert...' : 'AI Generieren'}
        </Button>
      );
    }

    if (task.task_type === 'meta_upload' && task.status === 'pending') {
      return (
        <Button
          variant="primary"
          size="sm"
          onClick={() => uploadToMeta(task)}
          disabled={isLoading}
        >
          <Upload className="w-3.5 h-3.5" />
          {isLoading ? 'Lädt hoch...' : 'In Meta hochladen'}
        </Button>
      );
    }

    if (task.task_type === 'funnel_publish' && task.status === 'pending') {
      return (
        <Button
          variant="primary"
          size="sm"
          onClick={() => publishFunnel(task)}
          disabled={isLoading}
        >
          <Rocket className="w-3.5 h-3.5" />
          {isLoading ? 'Veröffentlicht...' : 'Funnel veröffentlichen'}
        </Button>
      );
    }

    if (task.task_type === 'manual' && task.status === 'pending') {
      return (
        <Button
          variant="soft"
          size="sm"
          onClick={() => updateStatus(task.id, 'done')}
          disabled={isLoading}
        >
          <Check className="w-3.5 h-3.5" />
          Erledigt
        </Button>
      );
    }

    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  const completed = tasks.filter((t) => t.status === 'done').length;
  const total = tasks.length;

  return (
    <div className="max-w-6xl">
      <Link href={`/clients/${id}`} className="inline-flex items-center gap-1.5 text-gray-600 hover:text-red-500 text-sm mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Zurück zum Kunden
      </Link>

      <PageHeader
        label="FULFILLMENT"
        title="Fulfillment"
        description={`${completed} von ${total} Aufgaben erledigt`}
        action={
          <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-600 rounded-full transition-all"
              style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
            />
          </div>
        }
      />

      <div className="space-y-4">
        {tasks.map((task) => {
          const config = statusConfig[task.status] || statusConfig.pending;
          const actionBtn = getActionButton(task);

          return (
            <Card key={task.id} padding="md" className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                task.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'
              }`}>
                {task.status === 'done' ? <Check className="w-5 h-5" /> : (taskIcons[task.task_type] ?? <MoreHorizontal className="w-5 h-5" />)}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900">{task.title}</p>
                {task.description && (
                  <p className="text-xs text-gray-600 truncate">{task.description}</p>
                )}
              </div>

              <Badge tone={config.tone}>{config.label}</Badge>

              <div className="flex items-center gap-3">
                {actionBtn}
                {/* Status progression buttons when no 1-click action applies */}
                {!actionBtn && task.status === 'pending' && (
                  <Button variant="ghost" size="sm" onClick={() => updateStatus(task.id, 'in_progress')}>
                    <Play className="w-3.5 h-3.5" /> Start
                  </Button>
                )}
                {task.status === 'in_progress' && (
                  <Button variant="ghost" size="sm" onClick={() => updateStatus(task.id, 'review')}>
                    <Eye className="w-3.5 h-3.5" /> Review
                  </Button>
                )}
                {task.status === 'review' && (
                  <Button variant="secondary" size="sm" onClick={() => updateStatus(task.id, 'done')}>
                    <Check className="w-3.5 h-3.5" /> Fertig
                  </Button>
                )}
              </div>
            </Card>
          );
        })}

        {tasks.length === 0 && (
          <Card padding="lg" className="text-center">
            <p className="text-gray-600">Noch keine Aufgaben. Das Onboarding wurde noch nicht abgeschlossen.</p>
          </Card>
        )}
      </div>

      {/* Review Modal */}
      <Modal
        open={reviewOpen}
        onClose={() => {}}
        title="Content prüfen"
        width="max-w-3xl"
      >
        <div className="space-y-6">
          {/* Content Preview */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Generierter Content</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
              <pre className="text-sm text-gray-900 whitespace-pre-wrap font-sans leading-relaxed">{reviewContent}</pre>
            </div>
          </div>

          {/* Checklist */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Prüfliste</p>
            <div className="space-y-2">
              {REVIEW_QUESTIONS.map((question, i) => (
                <label
                  key={i}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={reviewChecks[i]}
                    onChange={() => toggleCheck(i)}
                    className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600"
                  />
                  <span className="text-sm text-gray-900">{question}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
            <Button
              variant="primary"
              size="sm"
              onClick={handleReviewApprove}
              disabled={!allChecked || reviewSaving}
            >
              <Check className="w-3.5 h-3.5" />
              {reviewSaving ? 'Speichert...' : 'Freigeben'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReviewRevise}
              disabled={reviewRevising}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {reviewRevising ? 'Überarbeitet...' : 'Überarbeiten'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReviewDiscard}
              className="ml-auto"
            >
              <X className="w-3.5 h-3.5" />
              Verwerfen
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
