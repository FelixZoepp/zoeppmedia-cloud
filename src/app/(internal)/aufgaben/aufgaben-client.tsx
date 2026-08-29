'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import type { ProjectTask, ProjectTaskStatus, TaskCheckitem } from '@/lib/types/database';
import type { UserRole } from '@/lib/auth';
import {
  ClipboardList, AlertTriangle, Clock, CheckCircle2,
  Circle, Loader2, Ban, ShieldCheck, ExternalLink,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProjectTaskWithRelations extends ProjectTask {
  task_checkitems: TaskCheckitem[];
  agencies: { id: string; name: string } | null;
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
  nicht_noetig: { label: 'Nicht noetig', tone: 'neutral', icon: Ban },
};

function formatFaelligAm(dateStr: string | null): { text: string; isOverdue: boolean; isToday: boolean } {
  if (!dateStr) return { text: '', isOverdue: false, isToday: false };

  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffMs = date.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < -1) return { text: `vor ${Math.abs(diffDays)} Tagen`, isOverdue: true, isToday: false };
  if (diffDays === -1) return { text: 'gestern', isOverdue: true, isToday: false };
  if (diffDays === 0) return { text: 'heute', isOverdue: false, isToday: true };
  if (diffDays === 1) return { text: 'morgen', isOverdue: false, isToday: false };
  return { text: `in ${diffDays} Tagen`, isOverdue: false, isToday: false };
}

function isTaskOverdue(task: ProjectTaskWithRelations): boolean {
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

function TaskRow({ task }: { task: ProjectTaskWithRelations }) {
  const statusCfg = STATUS_CONFIG[task.status];
  const StatusIcon = statusCfg.icon;
  const frist = formatFaelligAm(task.faellig_am);
  const checkitems = task.task_checkitems || [];
  const doneChecks = checkitems.filter((c) => c.erledigt).length;
  const totalChecks = checkitems.length;
  const overdue = isTaskOverdue(task);

  return (
    <Link href={`/aufgaben/${task.id}`}>
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
          {task.owner_funktion && (
            <p className="text-xs text-gray-400 truncate">{task.owner_funktion}</p>
          )}
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
              frist.isOverdue ? 'text-red-600' : frist.isToday ? 'text-amber-600' : 'text-gray-400'
            }`}
          >
            <Clock className="w-3 h-3" />
            {frist.text}
          </span>
        )}
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Agency Group                                                       */
/* ------------------------------------------------------------------ */

function AgencyGroup({ agencyName, agencyId, tasks }: { agencyName: string; agencyId: string; tasks: ProjectTaskWithRelations[] }) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'erledigt' || t.status === 'nicht_noetig').length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <Link
          href={`/clients/${agencyId}`}
          className="text-sm font-bold text-gray-900 hover:text-red-600 transition-colors flex items-center gap-1"
        >
          {agencyName}
          <ExternalLink className="w-3 h-3 text-gray-400" />
        </Link>
        <span className="text-xs text-gray-400 font-medium">{done}/{total} erledigt</span>
      </div>
      <div className="space-y-1.5">
        {tasks
          .sort((a, b) => {
            if (!a.faellig_am && !b.faellig_am) return 0;
            if (!a.faellig_am) return 1;
            if (!b.faellig_am) return -1;
            return a.faellig_am.localeCompare(b.faellig_am);
          })
          .map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

const STATUS_FILTER_OPTIONS = [
  { value: 'alle', label: 'Alle Status' },
  { value: 'offen', label: 'Offen' },
  { value: 'in_arbeit', label: 'In Arbeit' },
  { value: 'zur_freigabe', label: 'Zur Freigabe' },
  { value: 'blockiert', label: 'Blockiert' },
  { value: 'erledigt', label: 'Erledigt' },
];

const OWNER_FILTER_OPTIONS = [
  { value: 'alle', label: 'Alle Aufgaben' },
  { value: 'me', label: 'Nur meine' },
];

interface AufgabenClientProps {
  userRole: UserRole;
  userId: string;
}

export function AufgabenClient({ userRole, userId }: AufgabenClientProps) {
  const [tasks, setTasks] = useState<ProjectTaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('alle');
  const [ownerFilter, setOwnerFilter] = useState('alle');
  const isAdmin = userRole === 'admin';

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'alle') params.set('status', statusFilter);
    if (ownerFilter === 'me') params.set('owner', 'me');

    try {
      const res = await fetch(`/api/project-tasks?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data)) setTasks(data);
    } catch {
      // Silently handle error
    } finally {
      setLoading(false);
    }
  }, [statusFilter, ownerFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Separate overdue tasks
  const overdueTasks = tasks.filter(isTaskOverdue);
  const normalTasks = tasks.filter((t) => !isTaskOverdue(t));

  // Group normal tasks by agency
  const byAgency: Record<string, ProjectTaskWithRelations[]> = {};
  for (const t of normalTasks) {
    const key = t.agency_id;
    if (!byAgency[key]) byAgency[key] = [];
    byAgency[key].push(t);
  }

  // Group overdue tasks by agency
  const overdueByAgency: Record<string, ProjectTaskWithRelations[]> = {};
  for (const t of overdueTasks) {
    const key = t.agency_id;
    if (!overdueByAgency[key]) overdueByAgency[key] = [];
    overdueByAgency[key].push(t);
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
        label="FULFILLMENT"
        title="Aufgaben"
        counter={`${tasks.length} gesamt`}
      />

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Select
          options={STATUS_FILTER_OPTIONS}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-44"
        />
        {isAdmin && (
          <Select
            options={OWNER_FILTER_OPTIONS}
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="w-40"
          />
        )}
      </div>

      {/* Overdue section */}
      {overdueTasks.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-bold text-red-600 uppercase tracking-wide">
              Ueberfaellig ({overdueTasks.length})
            </span>
          </div>
          <Card padding="sm" className="!border-red-200 !bg-red-50/30 space-y-6">
            {Object.entries(overdueByAgency).map(([agencyId, agencyTasks]) => (
              <AgencyGroup
                key={agencyId}
                agencyId={agencyId}
                agencyName={agencyTasks[0]?.agencies?.name ?? agencyId.slice(0, 8)}
                tasks={agencyTasks}
              />
            ))}
          </Card>
        </div>
      )}

      {/* Normal tasks grouped by agency */}
      {Object.keys(byAgency).length > 0 ? (
        <div className="space-y-8">
          {Object.entries(byAgency).map(([agencyId, agencyTasks]) => (
            <AgencyGroup
              key={agencyId}
              agencyId={agencyId}
              agencyName={agencyTasks[0]?.agencies?.name ?? agencyId.slice(0, 8)}
              tasks={agencyTasks}
            />
          ))}
        </div>
      ) : overdueTasks.length === 0 ? (
        <Card padding="lg" className="text-center">
          <ClipboardList className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Keine Aufgaben</h2>
          <p className="text-gray-600">
            Es gibt aktuell keine Aufgaben mit den gewaehlten Filtern.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
