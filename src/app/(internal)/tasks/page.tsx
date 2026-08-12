'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import type { InternalTask, InternalTaskStatus, TaskPriority } from '@/lib/types/database';
import { PageHeader } from '@/components/ui/page-header';
import {
  Plus, ChevronRight, ChevronLeft, Calendar, User,
  Building2, Flag, MessageSquare, Trash2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const COLUMNS: { key: InternalTaskStatus; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Arbeit' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Erledigt' },
];

const PRIORITY_BADGE: Record<TaskPriority, { tone: 'accent' | 'softAccent' | 'neutral' | 'outline'; label: string }> = {
  urgent: { tone: 'accent', label: 'Dringend' },
  high: { tone: 'softAccent', label: 'Hoch' },
  medium: { tone: 'neutral', label: 'Mittel' },
  low: { tone: 'outline', label: 'Niedrig' },
};

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: 'urgent', label: 'Dringend' },
];

const STATUS_OPTIONS = COLUMNS.map((c) => ({ value: c.key, label: c.label }));

/* ------------------------------------------------------------------ */
/*  Task Card                                                         */
/* ------------------------------------------------------------------ */

function TaskCard({
  task,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
  onClick,
}: {
  task: InternalTask;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onClick: () => void;
}) {
  const p = PRIORITY_BADGE[task.priority];
  const dueDate = task.due_date
    ? new Date(task.due_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    : null;
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';

  return (
    <Card
      padding="sm"
      className="group cursor-pointer hover:shadow-[var(--shadow-md)] transition-shadow"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[15px] font-semibold text-[var(--text-primary)] leading-snug line-clamp-2 flex-1">
          {task.title}
        </p>
        <Badge tone={p.tone} className="flex-shrink-0 text-[11px] !px-2 !py-0.5">
          {p.label}
        </Badge>
      </div>

      {task.description && (
        <p className="text-[13px] text-[var(--text-secondary)] line-clamp-2 mb-3 leading-relaxed">
          {task.description}
        </p>
      )}

      <div className="flex items-center gap-3 text-[12px] text-[var(--text-tertiary)] mb-3">
        {task.assigned_to && (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span className="truncate max-w-[80px]">{task.assigned_to}</span>
          </span>
        )}
        {task.agency_id && (
          <span className="flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            <span className="truncate max-w-[80px]">{task.agency_id.slice(0, 8)}</span>
          </span>
        )}
        {dueDate && (
          <span className={`flex items-center gap-1 ${isOverdue ? 'text-[var(--danger-600)] font-medium' : ''}`}>
            <Calendar className="w-3 h-3" />
            {dueDate}
          </span>
        )}
      </div>

      {/* Move buttons */}
      <div
        className="flex items-center gap-1 pt-2 border-t border-[var(--border-default)] opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          disabled={!canMoveLeft}
          onClick={onMoveLeft}
          className="flex items-center gap-0.5 px-2 py-1 rounded-[var(--radius-xs)] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-3 h-3" /> Zurück
        </button>
        <div className="flex-1" />
        <button
          disabled={!canMoveRight}
          onClick={onMoveRight}
          className="flex items-center gap-0.5 px-2 py-1 rounded-[var(--radius-xs)] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Weiter <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                         */
/* ------------------------------------------------------------------ */

export default function TasksPage() {
  const [tasks, setTasks] = useState<InternalTask[]>([]);
  const [loading, setLoading] = useState(true);

  // New task modal
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium');
  const [newStatus, setNewStatus] = useState<InternalTaskStatus>('backlog');
  const [newAssignedTo, setNewAssignedTo] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [creating, setCreating] = useState(false);

  // Detail modal
  const [selectedTask, setSelectedTask] = useState<InternalTask | null>(null);
  const [comments, setComments] = useState<{ id: string; user_id: string; text: string; created_at: string }[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  /* ---- Fetch tasks ---- */

  const fetchTasks = useCallback(() => {
    fetch('/api/tasks')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTasks(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  /* ---- Move task between columns ---- */

  async function moveTask(taskId: string, newStatus: InternalTaskStatus) {
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus, updated_at: new Date().toISOString() } : t))
    );

    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  /* ---- Create task ---- */

  async function createTask() {
    if (!newTitle.trim()) return;
    setCreating(true);

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        priority: newPriority,
        status: newStatus,
        assigned_to: newAssignedTo.trim() || null,
        due_date: newDueDate || null,
      }),
    });

    if (res.ok) {
      const task = await res.json();
      setTasks((prev) => [task, ...prev]);
      resetCreateForm();
    }

    setCreating(false);
  }

  function resetCreateForm() {
    setShowCreate(false);
    setNewTitle('');
    setNewDescription('');
    setNewPriority('medium');
    setNewStatus('backlog');
    setNewAssignedTo('');
    setNewDueDate('');
  }

  /* ---- Delete task ---- */

  async function deleteTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedTask(null);

    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
  }

  /* ---- Open detail ---- */

  function openDetail(task: InternalTask) {
    setSelectedTask(task);
    setComments([]);
    setLoadingComments(true);

    // Fetch comments (the endpoint may not exist yet -- handle gracefully)
    fetch(`/api/tasks/${task.id}/comments`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setComments(data);
      })
      .catch(() => {})
      .finally(() => setLoadingComments(false));
  }

  /* ---- Post comment ---- */

  async function postComment() {
    if (!newComment.trim() || !selectedTask) return;
    const res = await fetch(`/api/tasks/${selectedTask.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newComment.trim() }),
    });
    if (res.ok) {
      const comment = await res.json();
      setComments((prev) => [...prev, comment]);
      setNewComment('');
    }
  }

  /* ---- Helpers ---- */

  function getColumnIndex(status: InternalTaskStatus) {
    return COLUMNS.findIndex((c) => c.key === status);
  }

  /* ---- Loading state ---- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  /* ---- Render ---- */

  return (
    <div>
      <PageHeader
        label="FULFILLMENT"
        title="Aufgaben"
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> Neue Aufgabe
          </Button>
        }
      />

      {/* Kanban Board */}
      <div className="flex gap-6 overflow-x-auto pb-4 -mx-2 px-2">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key);
          const colIdx = getColumnIndex(col.key);

          return (
            <div key={col.key} className="flex-shrink-0 w-80">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <div
                  className={`w-2 h-2 rounded-full ${
                    col.key === 'done'
                      ? 'bg-green-500'
                      : col.key === 'review'
                      ? 'bg-amber-500'
                      : col.key === 'in_progress'
                      ? 'bg-red-500'
                      : 'bg-gray-400'
                  }`}
                />
                <span className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wide">
                  {col.label}
                </span>
                <span className="text-[12px] text-[var(--text-tertiary)] font-medium ml-auto">
                  {colTasks.length}
                </span>
              </div>

              {/* Column body */}
              <div className="space-y-4 min-h-[200px] bg-[var(--surface-app)] rounded-[var(--radius-lg)] p-4 border border-[var(--border-default)] border-dashed">
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    canMoveLeft={colIdx > 0}
                    canMoveRight={colIdx < COLUMNS.length - 1}
                    onMoveLeft={() => moveTask(task.id, COLUMNS[colIdx - 1].key)}
                    onMoveRight={() => moveTask(task.id, COLUMNS[colIdx + 1].key)}
                    onClick={() => openDetail(task)}
                  />
                ))}

                {colTasks.length === 0 && (
                  <div className="flex items-center justify-center h-24 text-[13px] text-[var(--text-tertiary)]">
                    Keine Aufgaben
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- Create Task Modal ---- */}
      <Modal open={showCreate} onClose={resetCreateForm} title="Neue Aufgabe" width="max-w-md">
        <div className="space-y-6">
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Titel *</label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="z.B. Ad Copy für Mustermann GmbH"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Beschreibung</label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Optionale Details..."
              rows={3}
              className="w-full bg-white border border-gray-200 rounded-[var(--radius-md)] px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 shadow-[var(--shadow-xs)] outline-none resize-none focus-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Priorität</label>
              <Select
                options={PRIORITY_OPTIONS}
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Status</label>
              <Select
                options={STATUS_OPTIONS}
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as InternalTaskStatus)}
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Zugewiesen an</label>
            <Input
              value={newAssignedTo}
              onChange={(e) => setNewAssignedTo(e.target.value)}
              placeholder="Name oder ID"
              icon={<User className="w-4 h-4" />}
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Fällig am</label>
            <Input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              icon={<Calendar className="w-4 h-4" />}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={resetCreateForm}>Abbrechen</Button>
            <Button onClick={createTask} disabled={!newTitle.trim() || creating}>
              {creating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Erstellen...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Erstellen
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ---- Detail Modal ---- */}
      <Modal
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        title={selectedTask?.title ?? ''}
        width="max-w-xl"
      >
        {selectedTask && (
          <div className="space-y-6">
            {/* Meta info */}
            <div className="flex flex-wrap gap-2">
              <Badge tone={PRIORITY_BADGE[selectedTask.priority].tone}>
                <Flag className="w-3 h-3 mr-1" />
                {PRIORITY_BADGE[selectedTask.priority].label}
              </Badge>
              <Badge tone="neutral">
                {COLUMNS.find((c) => c.key === selectedTask.status)?.label}
              </Badge>
              {selectedTask.assigned_to && (
                <Badge tone="outline">
                  <User className="w-3 h-3 mr-1" />
                  {selectedTask.assigned_to}
                </Badge>
              )}
              {selectedTask.due_date && (
                <Badge tone={new Date(selectedTask.due_date) < new Date() && selectedTask.status !== 'done' ? 'accent' : 'outline'}>
                  <Calendar className="w-3 h-3 mr-1" />
                  {new Date(selectedTask.due_date).toLocaleDateString('de-DE')}
                </Badge>
              )}
            </div>

            {/* Description */}
            {selectedTask.description && (
              <div className="bg-[var(--surface-subtle)] rounded-[var(--radius-md)] p-4">
                <p className="text-[var(--text-body)] text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                  {selectedTask.description}
                </p>
              </div>
            )}

            {/* Status move buttons */}
            <div>
              <label className="block text-[13px] font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide">
                Status ändern
              </label>
              <div className="flex flex-wrap gap-2">
                {COLUMNS.map((col) => (
                  <Button
                    key={col.key}
                    variant={selectedTask.status === col.key ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => {
                      moveTask(selectedTask.id, col.key);
                      setSelectedTask({ ...selectedTask, status: col.key });
                    }}
                  >
                    {col.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Comments */}
            <div>
              <label className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-secondary)] mb-3 uppercase tracking-wide">
                <MessageSquare className="w-3.5 h-3.5" />
                Kommentare
              </label>

              {loadingComments ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-5 max-h-48 overflow-y-auto mb-3">
                  {comments.length === 0 && (
                    <p className="text-[13px] text-[var(--text-tertiary)] text-center py-3">
                      Noch keine Kommentare
                    </p>
                  )}
                  {comments.map((c) => (
                    <div key={c.id} className="bg-[var(--surface-subtle)] rounded-[var(--radius-sm)] p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                          {c.user_id.slice(0, 8)}
                        </span>
                        <span className="text-[11px] text-[var(--text-tertiary)]">
                          {new Date(c.created_at).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-[14px] text-[var(--text-primary)]">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Kommentar schreiben..."
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      postComment();
                    }
                  }}
                />
                <Button size="md" onClick={postComment} disabled={!newComment.trim()}>
                  Senden
                </Button>
              </div>
            </div>

            {/* Delete */}
            <div className="pt-3 border-t border-[var(--border-default)]">
              <button
                onClick={() => deleteTask(selectedTask.id)}
                className="flex items-center gap-1.5 text-[13px] text-[var(--danger-600)] hover:text-red-700 font-medium transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Aufgabe löschen
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
