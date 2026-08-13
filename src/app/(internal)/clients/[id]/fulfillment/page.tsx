'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import {
  FolderKanban, FileText, PhoneCall, Target, MoreHorizontal,
  Check, Clock, Eye, Play, ArrowLeft, Sparkles, Upload, Rocket,
  Video, Briefcase, Megaphone,
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
        // Save generated content to library as draft
        await fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agency_id: id,
            content_type: task.task_type,
            title: task.title,
            content: data.content ?? '',
            status: 'draft',
          }),
        });
        await updateStatus(task.id, 'review');
      } else {
        await updateStatus(task.id, 'pending');
      }
    } catch {
      await updateStatus(task.id, 'pending');
    } finally {
      setActionLoading(null);
    }
  }

  async function uploadToMeta(task: FulfillmentTask) {
    setActionLoading(task.id);
    await updateStatus(task.id, 'in_progress');

    try {
      // Fetch approved ad copy from content library
      const contentRes = await fetch(`/api/library?agency_id=${id}&content_type=ad_copy&status=approved`);
      const contents = await contentRes.json();
      const approved = Array.isArray(contents) ? contents[0] : null;

      if (!approved) {
        alert('Bitte zuerst Ad Copys generieren und freigeben lassen.');
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
        alert(`Fehler beim Meta-Upload: ${err.error ?? 'Unbekannter Fehler'}`);
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
          alert(data.message);
        }
        await updateStatus(task.id, 'done');
      } else {
        const err = await res.json();
        alert(`Fehler beim Veröffentlichen: ${err.error ?? 'Unbekannter Fehler'}`);
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
    </div>
  );
}
