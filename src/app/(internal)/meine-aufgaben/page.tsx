'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles, Check, Calendar, Users, ListTodo,
  ChevronRight, Clock, AlertCircle, ArrowRight,
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

// ---- Unified task shape for timeline display ----

type TaskSource = 'fulfillment' | 'playbook' | 'recurring';
type TaskBucket = 'today' | 'tomorrow' | 'thisweek';

interface UnifiedTask {
  id: string;
  agencyId: string | null;
  agencyName: string | null;
  title: string;
  taskType: string;
  source: TaskSource;
  bucket: TaskBucket;
  dueDate: string | null;
  isAiTask: boolean;
  originalFulfillment?: FulfillmentTask;
  originalPlaybook?: PlaybookTask;
  originalRecurring?: RecurringTask;
}

// ---- Constants ----

const AI_TASK_TYPES = ['ad_copy', 'phone_script', 'video_script', 'job_posting', 'creative_brief', 'funnel_text', 'vg_leitfaden', 'follow_up', 'absage'];

// ---- Helpers ----

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function getTomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function getWeekEndStr() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

function formatGermanDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
}

function getBucket(dueDate: string | null): TaskBucket {
  if (!dueDate) return 'thisweek';
  const today = getTodayStr();
  const tomorrow = getTomorrowStr();
  if (dueDate <= today) return 'today';
  if (dueDate <= tomorrow) return 'tomorrow';
  return 'thisweek';
}

function buildUnifiedTasks(data: TasksData): UnifiedTask[] {
  const tasks: UnifiedTask[] = [];

  for (const t of data.fulfillment) {
    const isAi = AI_TASK_TYPES.includes(t.task_type);
    tasks.push({
      id: t.id,
      agencyId: t.agency_id,
      agencyName: t.agency_name,
      title: t.title,
      taskType: t.task_type,
      source: 'fulfillment',
      bucket: 'today', // fulfillment tasks are always "today" if pending
      dueDate: null,
      isAiTask: isAi,
      originalFulfillment: t,
    });
  }

  for (const t of data.recurring) {
    tasks.push({
      id: t.id,
      agencyId: t.agency_id,
      agencyName: t.agency_name,
      title: t.title,
      taskType: t.task_key,
      source: 'recurring',
      bucket: getBucket(t.due_date),
      dueDate: t.due_date,
      isAiTask: false,
      originalRecurring: t,
    });
  }

  for (const t of data.playbook) {
    tasks.push({
      id: t.id,
      agencyId: t.agency_id,
      agencyName: t.agency_name,
      title: t.action_text,
      taskType: t.playbook_key,
      source: 'playbook',
      bucket: 'thisweek',
      dueDate: null,
      isAiTask: false,
      originalPlaybook: t,
    });
  }

  return tasks;
}

// ---- Stat Card ----

function StatCard({ icon, label, value, tone = 'default' }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: 'default' | 'urgent';
}) {
  return (
    <Card padding="sm" className="flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
        tone === 'urgent' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
      }`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </Card>
  );
}

// ---- Task Row ----

function TaskRow({
  task,
  onMarkDone,
  onNavigate,
}: {
  task: UnifiedTask;
  onMarkDone: (task: UnifiedTask) => void;
  onNavigate: (task: UnifiedTask) => void;
}) {
  const isOverdue = task.dueDate && task.dueDate < getTodayStr();

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      {/* Dot */}
      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${
        isOverdue ? 'bg-red-500' : task.isAiTask ? 'bg-purple-400' : 'bg-gray-300'
      }`} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {task.agencyName && (
          <Link
            href={`/clients/${task.agencyId}`}
            className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline"
          >
            {task.agencyName}
          </Link>
        )}
        <p className="text-sm text-gray-900 font-medium leading-snug mt-0.5">{task.title}</p>
        {task.dueDate && (
          <p className={`text-xs mt-0.5 flex items-center gap-1 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
            <Clock className="w-3 h-3" />
            {formatGermanDate(task.dueDate)}
            {isOverdue && ' — überfällig'}
          </p>
        )}
      </div>

      {/* Action */}
      <div className="flex-shrink-0">
        {task.isAiTask ? (
          <Button variant="primary" size="sm" onClick={() => onNavigate(task)}>
            <Sparkles className="w-3.5 h-3.5" />
            Generieren
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        ) : task.source === 'playbook' || task.source === 'recurring' ? (
          <Button variant="soft" size="sm" onClick={() => onMarkDone(task)}>
            <Check className="w-3.5 h-3.5" />
            Erledigt
          </Button>
        ) : (
          <Link href={`/clients/${task.agencyId}`}>
            <Button variant="ghost" size="sm">
              Zum Kunden
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

// ---- Agency Progress Card ----

function AgencyProgressCard({
  agencyId,
  agencyName,
  tasks,
  onNavigate,
}: {
  agencyId: string;
  agencyName: string;
  tasks: FulfillmentTask[];
  onNavigate: (agencyId: string, taskType: string) => void;
}) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const nextTask = tasks.find((t) => t.status !== 'done');
  const isAiNext = nextTask ? AI_TASK_TYPES.includes(nextTask.task_type) : false;

  return (
    <Card padding="sm" className="space-y-3">
      <div className="flex items-center justify-between">
        <Link href={`/clients/${agencyId}`} className="font-semibold text-sm text-gray-900 hover:text-red-600 transition-colors">
          {agencyName}
        </Link>
        <span className="text-xs text-gray-400 font-medium">{done}/{total} erledigt</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-red-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-400">{pct}% abgeschlossen</p>

      {nextTask && (
        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
          <div className="min-w-0">
            <p className="text-xs text-gray-400">Nächste Aufgabe</p>
            <p className="text-sm text-gray-900 font-medium truncate">{nextTask.title}</p>
          </div>
          {isAiNext ? (
            <Button variant="primary" size="sm" className="ml-3 flex-shrink-0" onClick={() => onNavigate(agencyId, nextTask.task_type)}>
              <Sparkles className="w-3.5 h-3.5" />
              Generieren
            </Button>
          ) : (
            <Link href={`/clients/${agencyId}/fulfillment`} className="ml-3 flex-shrink-0">
              <Button variant="ghost" size="sm">
                Öffnen
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          )}
        </div>
      )}

      {!nextTask && (
        <p className="text-xs text-green-600 font-medium flex items-center gap-1 pt-1 border-t border-gray-100">
          <Check className="w-3 h-3" />
          Alle Aufgaben erledigt
        </p>
      )}
    </Card>
  );
}

// ---- Section Header ----

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {count > 0 && (
        <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-medium">{count}</span>
      )}
    </div>
  );
}

// ---- Day Group ----

function DayGroup({ label, tasks, onMarkDone, onNavigate }: {
  label: string;
  tasks: UnifiedTask[];
  onMarkDone: (task: UnifiedTask) => void;
  onNavigate: (task: UnifiedTask) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="mb-6">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      <Card padding="none" className="px-4">
        {tasks.map((task) => (
          <TaskRow key={`${task.source}-${task.id}`} task={task} onMarkDone={onMarkDone} onNavigate={onNavigate} />
        ))}
      </Card>
    </div>
  );
}

// ---- Main page ----

export default function MeineAufgabenPage() {
  const router = useRouter();
  const [data, setData] = useState<TasksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/employee/tasks')
      .then((r) => r.json())
      .then((d: TasksData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Mark a non-AI task done
  async function handleMarkDone(task: UnifiedTask) {
    setDoneIds((prev) => new Set([...prev, task.id]));
    try {
      if (task.source === 'recurring') {
        await fetch(`/api/fulfillment/recurring/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'done' }),
        });
      } else if (task.source === 'playbook') {
        await fetch(`/api/playbook-tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'done' }),
        });
      } else if (task.source === 'fulfillment') {
        await fetch(`/api/fulfillment/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'done' }),
        });
      }
      toast.success('Aufgabe als erledigt markiert.');
      // Remove from local state
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          fulfillment: prev.fulfillment.filter((t) => t.id !== task.id),
          playbook: prev.playbook.filter((t) => t.id !== task.id),
          recurring: prev.recurring.filter((t) => t.id !== task.id),
        };
      });
    } catch {
      setDoneIds((prev) => { const s = new Set(prev); s.delete(task.id); return s; });
      toast.error('Fehler beim Speichern.');
    }
  }

  // Navigate to AI tools with deep-link
  function handleNavigateAI(task: UnifiedTask) {
    if (!task.agencyId) return;
    router.push(`/ai-tools?agency=${task.agencyId}&type=${task.taskType}`);
  }

  // Navigate from agency card
  function handleAgencyNavigate(agencyId: string, taskType: string) {
    router.push(`/ai-tools?agency=${agencyId}&type=${taskType}`);
  }

  // ---- Derived ----

  const allTasks = data ? buildUnifiedTasks(data).filter((t) => !doneIds.has(t.id)) : [];

  const todayLabel = `Heute (${formatGermanDate(getTodayStr())})`;
  const tomorrowLabel = `Morgen (${formatGermanDate(getTomorrowStr())})`;
  const weekEndLabel = `Diese Woche (bis ${formatGermanDate(getWeekEndStr())})`;

  const todayTasks = allTasks.filter((t) => t.bucket === 'today');
  const tomorrowTasks = allTasks.filter((t) => t.bucket === 'tomorrow');
  const weekTasks = allTasks.filter((t) => t.bucket === 'thisweek');

  const totalOpen = allTasks.length;
  const todayDue = todayTasks.length;

  // Distinct assigned agencies (from fulfillment data for progress view)
  const agencyIds = [...new Set((data?.agencies ?? []).map((a) => a.id))];

  // Fulfillment tasks grouped by agency (all statuses for progress)
  // We only have non-done tasks in data.fulfillment, but show progress anyway
  const fulfillmentByAgency: Record<string, FulfillmentTask[]> = {};
  for (const t of data?.fulfillment ?? []) {
    if (!fulfillmentByAgency[t.agency_id]) fulfillmentByAgency[t.agency_id] = [];
    fulfillmentByAgency[t.agency_id].push(t);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        label="MEINE AUFGABEN"
        title="Meine Aufgaben"
        description="Deine Übersicht für heute und diese Woche"
      />

      {/* ---- Quick Stats ---- */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={<ListTodo className="w-5 h-5" />}
          label="Offene Aufgaben"
          value={totalOpen}
        />
        <StatCard
          icon={<AlertCircle className="w-5 h-5" />}
          label="Heute fällig"
          value={todayDue}
          tone={todayDue > 0 ? 'urgent' : 'default'}
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Kunden"
          value={agencyIds.length}
        />
      </div>

      {/* ---- Section 1: Timeline ---- */}
      <section>
        <SectionHeader
          title="Heute & Diese Woche"
          count={todayTasks.length + tomorrowTasks.length + weekTasks.length}
        />

        {allTasks.length === 0 ? (
          <Card padding="md">
            <div className="text-center py-4">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mx-auto mb-3">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-sm font-semibold text-gray-900">Alles erledigt!</p>
              <p className="text-xs text-gray-500 mt-1">Keine offenen Aufgaben diese Woche.</p>
            </div>
          </Card>
        ) : (
          <>
            <DayGroup
              label={todayLabel}
              tasks={todayTasks}
              onMarkDone={handleMarkDone}
              onNavigate={handleNavigateAI}
            />
            <DayGroup
              label={tomorrowLabel}
              tasks={tomorrowTasks}
              onMarkDone={handleMarkDone}
              onNavigate={handleNavigateAI}
            />
            <DayGroup
              label={weekEndLabel}
              tasks={weekTasks}
              onMarkDone={handleMarkDone}
              onNavigate={handleNavigateAI}
            />
          </>
        )}
      </section>

      {/* ---- Section 2: Kunden-Übersicht ---- */}
      {Object.keys(fulfillmentByAgency).length > 0 && (
        <section>
          <SectionHeader title="Kunden-Übersicht" count={Object.keys(fulfillmentByAgency).length} />
          <div className="space-y-3">
            {Object.entries(fulfillmentByAgency).map(([agencyId, tasks]) => {
              const agencyName = tasks[0]?.agency_name ?? agencyId;
              return (
                <AgencyProgressCard
                  key={agencyId}
                  agencyId={agencyId}
                  agencyName={agencyName}
                  tasks={tasks}
                  onNavigate={handleAgencyNavigate}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* ---- Section 3: Anstehende Termine (placeholder) ---- */}
      <section>
        <SectionHeader title="Anstehende Termine" count={0} />
        <Card padding="sm" className="flex items-center gap-4 text-gray-400">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <p className="text-sm">Calendly-Termine werden hier angezeigt, sobald die Integration aktiv ist.</p>
        </Card>
      </section>
    </div>
  );
}
