'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import type { ProjectTask, ProjectTaskStatus, TaskCheckitem } from '@/lib/types/database';
import {
  ClipboardList, Clock, CheckCircle2, Circle, Loader2,
  Ban, ShieldCheck, ChevronRight, AlertTriangle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProjectTaskWithCheckitems extends ProjectTask {
  task_checkitems: TaskCheckitem[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<ProjectTaskStatus, { label: string; tone: 'accent' | 'softAccent' | 'success' | 'neutral' | 'outline'; icon: typeof Circle }> = {
  blockiert: { label: 'Blockiert', tone: 'accent', icon: Ban },
  offen: { label: 'Offen', tone: 'neutral', icon: Circle },
  in_arbeit: { label: 'In Arbeit', tone: 'softAccent', icon: Loader2 },
  zur_freigabe: { label: 'Zur Freigabe', tone: 'outline', icon: ShieldCheck },
  erledigt: { label: 'Erledigt', tone: 'success', icon: CheckCircle2 },
  nicht_noetig: { label: 'Nicht nötig', tone: 'neutral', icon: Ban },
};

function formatFristRelative(dateStr: string | null): { text: string; isOverdue: boolean } {
  if (!dateStr) return { text: '', isOverdue: false };
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = date.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < -1) return { text: `${Math.abs(diffDays)} Tage überfällig`, isOverdue: true };
  if (diffDays === -1) return { text: 'Seit gestern überfällig', isOverdue: true };
  if (diffDays === 0) return { text: 'Heute fällig', isOverdue: false };
  if (diffDays === 1) return { text: 'Morgen fällig', isOverdue: false };
  return { text: `In ${diffDays} Tagen fällig`, isOverdue: false };
}

function isTaskOverdue(task: ProjectTaskWithCheckitems): boolean {
  if (!task.faellig_am) return false;
  if (task.status === 'erledigt' || task.status === 'nicht_noetig') return false;
  const date = new Date(task.faellig_am + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

/* ------------------------------------------------------------------ */
/*  Task Row                                                           */
/* ------------------------------------------------------------------ */

function TaskRow({ task }: { task: ProjectTaskWithCheckitems }) {
  const statusCfg = STATUS_CONFIG[task.status];
  const StatusIcon = statusCfg.icon;
  const frist = formatFristRelative(task.faellig_am);
  const checkitems = task.task_checkitems || [];
  const doneChecks = checkitems.filter((c) => c.erledigt).length;
  const totalChecks = checkitems.length;
  const overdue = isTaskOverdue(task);

  return (
    <Link href={`/meine-aufgaben-portal/${task.id}`}>
      <div
        className={`flex items-center gap-4 px-4 py-3 rounded-xl border bg-white hover:shadow-md transition-shadow cursor-pointer ${
          overdue ? 'border-red-300 bg-red-50/50' : 'border-gray-200'
        }`}
      >
        {/* Status icon */}
        <StatusIcon
          className={`w-4 h-4 flex-shrink-0 ${
            task.status === 'in_arbeit' ? 'text-red-500 animate-spin' :
            task.status === 'erledigt' ? 'text-green-500' :
            task.status === 'blockiert' ? 'text-red-400' :
            'text-gray-400'
          }`}
        />

        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{task.titel}</p>
        </div>

        {/* Status badge */}
        <Badge tone={statusCfg.tone} className="flex-shrink-0">
          {statusCfg.label}
        </Badge>

        {/* Checkitems progress */}
        {totalChecks > 0 && (
          <span className="text-xs text-gray-500 flex-shrink-0 font-medium tabular-nums">
            {doneChecks}/{totalChecks}
          </span>
        )}

        {/* Due date */}
        {frist.text && (
          <span
            className={`text-xs flex-shrink-0 font-medium flex items-center gap-1 ${
              frist.isOverdue ? 'text-red-600' : 'text-gray-400'
            }`}
          >
            <Clock className="w-3 h-3" />
            {frist.text}
          </span>
        )}

        <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface PortalAufgabenClientProps {
  userId: string;
}

export function PortalAufgabenClient({ userId }: PortalAufgabenClientProps) {
  const [tasks, setTasks] = useState<ProjectTaskWithCheckitems[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/project-tasks');
      const data = await res.json();
      if (Array.isArray(data)) {
        // Filter to customer tasks only (owner_funktion = 'kunde')
        const customerTasks = data.filter(
          (t: ProjectTaskWithCheckitems) => t.owner_funktion === 'kunde'
        );
        setTasks(customerTasks);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  const openTasks = tasks.filter((t) => t.status !== 'erledigt' && t.status !== 'nicht_noetig');
  const doneTasks = tasks.filter((t) => t.status === 'erledigt' || t.status === 'nicht_noetig');
  const overdueTasks = openTasks.filter(isTaskOverdue);
  const normalTasks = openTasks.filter((t) => !isTaskOverdue(t));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        label="ZUSAMMENARBEIT"
        title="Meine Aufgaben"
        description="Aufgaben, die von dir erledigt werden müssen"
        counter={`${openTasks.length} offen`}
      />

      {/* Overdue section */}
      {overdueTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-bold text-red-600 uppercase tracking-wide">
              Überfällig ({overdueTasks.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {overdueTasks
              .sort((a, b) => (a.faellig_am || '').localeCompare(b.faellig_am || ''))
              .map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
          </div>
        </div>
      )}

      {/* Open tasks */}
      {normalTasks.length > 0 && (
        <div className="space-y-1.5">
          {normalTasks
            .sort((a, b) => (a.faellig_am || 'z').localeCompare(b.faellig_am || 'z'))
            .map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
        </div>
      )}

      {/* Empty state */}
      {openTasks.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-10 shadow-sm text-center">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Keine offenen Aufgaben</h2>
          <p className="text-sm text-gray-500">
            Aktuell gibt es keine Aufgaben, die von dir erledigt werden müssen.
          </p>
        </div>
      )}

      {/* Done tasks */}
      {doneTasks.length > 0 && (
        <div className="space-y-2 pt-4">
          <div className="flex items-center gap-2 px-1">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-sm font-bold text-gray-400 uppercase tracking-wide">
              Erledigt ({doneTasks.length})
            </span>
          </div>
          <div className="space-y-1.5 opacity-60">
            {doneTasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
