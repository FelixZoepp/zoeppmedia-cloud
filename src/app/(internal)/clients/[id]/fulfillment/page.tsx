'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FolderKanban, FileText, PhoneCall, Target, MoreHorizontal,
  Check, Clock, Eye, Play, ArrowLeft, Sparkles
} from 'lucide-react';
import Link from 'next/link';

const taskIcons: Record<string, React.ReactNode> = {
  perspective_funnel: <FolderKanban className="w-5 h-5" />,
  ad_copy: <FileText className="w-5 h-5" />,
  script: <PhoneCall className="w-5 h-5" />,
  meta_campaign: <Target className="w-5 h-5" />,
  other: <MoreHorizontal className="w-5 h-5" />,
};

const statusConfig: Record<string, { label: string; tone: 'neutral' | 'softAccent' | 'accent' | 'success' | 'outline' }> = {
  pending: { label: 'Ausstehend', tone: 'neutral' },
  in_progress: { label: 'In Arbeit', tone: 'softAccent' },
  review: { label: 'Review', tone: 'accent' },
  done: { label: 'Erledigt', tone: 'success' },
  skipped: { label: 'Übersprungen', tone: 'outline' },
};

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
  const [generating, setGenerating] = useState<string | null>(null);

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
    setGenerating(task.id);
    const typeMap: Record<string, string> = {
      ad_copy: 'ad_copy',
      script: 'script',
      perspective_funnel: 'funnel_text',
    };

    await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: typeMap[task.task_type] || 'ad_copy',
        agency_id: id,
        fulfillment_task_id: task.id,
      }),
    });

    await updateStatus(task.id, 'review');
    setGenerating(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  const completed = tasks.filter((t) => t.status === 'done').length;
  const total = tasks.length;

  return (
    <div className="max-w-3xl">
      <Link href={`/clients/${id}`} className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-red-500 text-[13px] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Zurück zum Kunden
      </Link>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[var(--text-h2)] font-extrabold text-[var(--text-primary)] tracking-[var(--tracking-heading)]">
            Fulfillment
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">{completed} von {total} Aufgaben erledigt</p>
        </div>
        <div className="w-24 h-2 bg-[var(--surface-inset)] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#EF5B6F] to-red-500 rounded-full transition-all"
            style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="space-y-4">
        {tasks.map((task) => {
          const config = statusConfig[task.status] || statusConfig.pending;
          const canGenerate = ['ad_copy', 'script', 'perspective_funnel'].includes(task.task_type) && task.status === 'pending';

          return (
            <Card key={task.id} padding="md" className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0 ${
                task.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-500'
              }`}>
                {task.status === 'done' ? <Check className="w-5 h-5" /> : taskIcons[task.task_type]}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[15px] text-[var(--text-primary)]">{task.title}</p>
                {task.description && (
                  <p className="text-[13px] text-[var(--text-secondary)] truncate">{task.description}</p>
                )}
              </div>

              <Badge tone={config.tone}>{config.label}</Badge>

              <div className="flex items-center gap-2">
                {canGenerate && (
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => generateContent(task)}
                    disabled={generating === task.id}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {generating === task.id ? 'Generiert...' : 'Generieren'}
                  </Button>
                )}
                {task.status === 'pending' && (
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
            <p className="text-[var(--text-secondary)]">Noch keine Aufgaben. Das Onboarding wurde noch nicht abgeschlossen.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
