'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import type { ProjectTask, TaskCheckitem } from '@/lib/types/database';
import {
  ShieldCheck, Check, X, ExternalLink, Clock,
  ChevronDown, ChevronUp, Loader2, LinkIcon,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FreigabeTask extends ProjectTask {
  task_checkitems: TaskCheckitem[];
  agencies: { id: string; name: string } | null;
}

/* ------------------------------------------------------------------ */
/*  Freigabe Card                                                      */
/* ------------------------------------------------------------------ */

function FreigabeCard({
  task,
  onApprove,
  onReject,
}: {
  task: FreigabeTask;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, notiz: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNotiz, setRejectNotiz] = useState('');
  const [processing, setProcessing] = useState(false);

  async function handleApprove() {
    setProcessing(true);
    try {
      await onApprove(task.id);
      toast.success(`"${task.titel}" freigegeben.`);
    } catch {
      toast.error('Freigabe fehlgeschlagen.');
    } finally {
      setProcessing(false);
    }
  }

  async function handleReject() {
    if (!rejectNotiz.trim()) {
      toast.error('Bitte einen Grund eingeben.');
      return;
    }
    setProcessing(true);
    try {
      await onReject(task.id, rejectNotiz.trim());
      toast.success(`"${task.titel}" zurueckgewiesen.`);
    } catch {
      toast.error('Zurueckweisung fehlgeschlagen.');
    } finally {
      setProcessing(false);
      setRejecting(false);
      setRejectNotiz('');
    }
  }

  const fristDate = task.faellig_am
    ? new Date(task.faellig_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    : null;

  return (
    <Card padding="sm" className="space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-4 h-4 text-amber-500 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <Link
            href={`/aufgaben/${task.id}`}
            className="text-sm font-semibold text-gray-900 hover:text-red-600 transition-colors truncate block"
          >
            {task.titel}
          </Link>
          <div className="flex items-center gap-2 mt-0.5">
            {task.agencies && (
              <Link
                href={`/clients/${task.agency_id}`}
                className="text-xs text-gray-400 hover:text-red-600 transition-colors flex items-center gap-0.5"
              >
                {task.agencies.name}
                <ExternalLink className="w-2.5 h-2.5" />
              </Link>
            )}
            {fristDate && (
              <span className="text-xs text-gray-400 flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {fristDate}
              </span>
            )}
          </div>
        </div>

        {/* Result link */}
        {task.ergebnis_url && (
          <a
            href={task.ergebnis_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 flex-shrink-0"
          >
            <LinkIcon className="w-3 h-3" />
            Ergebnis
            <ExternalLink className="w-3 h-3" />
          </a>
        )}

        {/* Expand for result text */}
        {task.ergebnis_text && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5 cursor-pointer"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Action buttons */}
        {!rejecting && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={processing}
            >
              {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Freigeben
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setRejecting(true)}
              disabled={processing}
            >
              <X className="w-3.5 h-3.5" />
              Zurueckweisen
            </Button>
          </div>
        )}
      </div>

      {/* Expanded result text */}
      {expanded && task.ergebnis_text && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Ergebnis-Text</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{task.ergebnis_text}</p>
        </div>
      )}

      {/* Reject input */}
      {rejecting && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={rejectNotiz}
            onChange={(e) => setRejectNotiz(e.target.value)}
            placeholder="Grund fuer Zurueckweisung..."
            className="flex-1"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={handleReject}
            disabled={processing || !rejectNotiz.trim()}
          >
            {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Senden'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setRejecting(false); setRejectNotiz(''); }}
          >
            Abbrechen
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function FreigabenClient() {
  const [tasks, setTasks] = useState<FreigabeTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/project-tasks?status=zur_freigabe');
      const data = await res.json();
      if (Array.isArray(data)) setTasks(data);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function handleApprove(taskId: string) {
    const res = await fetch(`/api/project-tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'erledigt' }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Fehler');
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  async function handleReject(taskId: string, notiz: string) {
    const res = await fetch(`/api/project-tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_arbeit', notiz }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Fehler');
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        label="VERWALTUNG"
        title="Freigaben"
        description="Aufgaben die auf Freigabe warten"
        counter={`${tasks.length} offen`}
      />

      {tasks.length === 0 ? (
        <Card padding="lg" className="text-center">
          <ShieldCheck className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Alles freigegeben</h2>
          <p className="text-gray-600">
            Keine Aufgaben warten aktuell auf Freigabe.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <FreigabeCard
              key={task.id}
              task={task}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
