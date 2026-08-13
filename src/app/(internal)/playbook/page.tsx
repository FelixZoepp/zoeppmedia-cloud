'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { PlaybookEntry, PlaybookTask } from '@/lib/types/database';
import { ChevronDown, ChevronUp, Search, AlertTriangle, Plus, Pencil, Trash2, CheckCircle, ClipboardList } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface TaskWithMeta extends PlaybookTask {
  agency_name?: string;
}

/* ------------------------------------------------------------------ */
/*  Kanban Column                                                       */
/* ------------------------------------------------------------------ */

const COLUMNS: { key: string; label: string; statusValues: PlaybookTask['status'][] }[] = [
  { key: 'open',        label: 'Offen',          statusValues: ['pending'] },
  { key: 'in_progress', label: 'In Bearbeitung',  statusValues: ['in_progress'] },
  { key: 'done',        label: 'Erledigt',        statusValues: ['done', 'skipped'] },
];

function TaskCard({
  task,
  onStatusChange,
}: {
  task: TaskWithMeta;
  onStatusChange: (id: string, status: PlaybookTask['status']) => Promise<void>;
}) {
  const [updating, setUpdating] = useState(false);

  async function markDone() {
    setUpdating(true);
    await onStatusChange(task.id, 'done');
    setUpdating(false);
  }

  async function moveToInProgress() {
    setUpdating(true);
    await onStatusChange(task.id, 'in_progress');
    setUpdating(false);
  }

  const isDone    = task.status === 'done' || task.status === 'skipped';
  const isPending = task.status === 'pending';

  return (
    <Card padding="sm" className={`space-y-3 ${isDone ? 'opacity-60' : ''}`}>
      <p className="text-sm font-medium text-gray-900 leading-snug">{task.action_text}</p>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="softAccent" className="text-xs !px-2 !py-0.5 font-mono">
          {task.playbook_key}
        </Badge>
        {task.agency_name && (
          <Badge tone="neutral" className="text-xs !px-2 !py-0.5">
            {task.agency_name}
          </Badge>
        )}
        <Badge
          tone={task.action_type === 'immediate' ? 'accent' : 'outline'}
          className="text-xs !px-2 !py-0.5"
        >
          {task.action_type === 'immediate' ? 'Sofort' : 'Langfristig'}
        </Badge>
      </div>
      {task.assigned_to && (
        <p className="text-xs text-gray-400">Zugewiesen: {task.assigned_to}</p>
      )}
      {!isDone && (
        <div className="flex gap-2 pt-1">
          {isPending && (
            <Button
              size="sm"
              variant="secondary"
              onClick={moveToInProgress}
              disabled={updating}
              className="text-xs"
            >
              Starten
            </Button>
          )}
          <Button
            size="sm"
            onClick={markDone}
            disabled={updating}
            className="text-xs flex items-center gap-1"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Erledigt
          </Button>
        </div>
      )}
    </Card>
  );
}

function KanbanBoard({ tasks, onStatusChange }: {
  tasks: TaskWithMeta[];
  onStatusChange: (id: string, status: PlaybookTask['status']) => Promise<void>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => col.statusValues.includes(t.status));
        return (
          <div key={col.key}>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{col.label}</h3>
              <span className="text-xs font-semibold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                {colTasks.length}
              </span>
            </div>
            <div className="space-y-3 min-h-[120px]">
              {colTasks.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center">
                  <p className="text-xs text-gray-400">Keine Aufgaben</p>
                </div>
              ) : (
                colTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onStatusChange={onStatusChange} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Accordion Item (Wissensdatenbank)                                   */
/* ------------------------------------------------------------------ */

function AccordionItem({
  entry,
  isAdmin,
  onEdit,
  onDelete,
}: {
  entry: PlaybookEntry;
  isAdmin: boolean;
  onEdit: (entry: PlaybookEntry) => void;
  onDelete: (entry: PlaybookEntry) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card padding="sm" className="transition-shadow hover:shadow-md">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left cursor-pointer"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <Badge tone="softAccent" className="text-xs !px-2 !py-0.5 font-mono">
              {entry.problem_key}
            </Badge>
            {entry.escalation_trigger && (
              <Badge tone="accent" className="text-xs !px-2 !py-0.5">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Eskalation
              </Badge>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-900 leading-snug">
            {entry.title}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAdmin && (
            <>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onEdit(entry); } }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Bearbeiten"
              >
                <Pencil className="w-3.5 h-3.5" />
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onDelete(entry); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onDelete(entry); } }}
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                title="Löschen"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </span>
            </>
          )}
          <span className="text-gray-400">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </div>
      </button>

      {open && (
        <div className="mt-5 space-y-8 border-t border-gray-200 pt-5">
          <div>
            <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Beschreibung</p>
            <p className="text-sm text-gray-900 leading-relaxed">{entry.description}</p>
          </div>

          {entry.causes.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Ursachen</p>
              <ul className="space-y-3">
                {entry.causes.map((cause, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-900">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-600/70 flex-shrink-0" />
                    {cause}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {entry.immediate_actions.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Sofort-Maßnahmen</p>
              <ol className="space-y-3">
                {entry.immediate_actions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-900">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    {action}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {entry.long_term_actions.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Langfristig</p>
              <ul className="space-y-3">
                {entry.long_term_actions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-900">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {entry.escalation_trigger && (
            <Card inset padding="sm" className="border-red-100 bg-red-50">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-0.5">Eskalations-Trigger</p>
                  <p className="text-sm text-red-700 leading-relaxed">{entry.escalation_trigger}</p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Playbook Form Modal                                                 */
/* ------------------------------------------------------------------ */

interface PlaybookFormData {
  problem_key: string;
  title: string;
  description: string;
  causes: string;
  immediate_actions: string;
  long_term_actions: string;
  escalation_trigger: string;
}

const emptyForm: PlaybookFormData = {
  problem_key: '',
  title: '',
  description: '',
  causes: '',
  immediate_actions: '',
  long_term_actions: '',
  escalation_trigger: '',
};

function PlaybookFormModal({
  open,
  onClose,
  onSaved,
  editEntry,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editEntry: PlaybookEntry | null;
}) {
  const [form, setForm] = useState<PlaybookFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editEntry) {
      setForm({
        problem_key: editEntry.problem_key,
        title: editEntry.title,
        description: editEntry.description,
        causes: editEntry.causes.join('\n'),
        immediate_actions: editEntry.immediate_actions.join('\n'),
        long_term_actions: editEntry.long_term_actions.join('\n'),
        escalation_trigger: editEntry.escalation_trigger ?? '',
      });
    } else {
      setForm(emptyForm);
    }
    setError('');
  }, [editEntry, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      problem_key: form.problem_key.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      causes: form.causes.split('\n').map((s) => s.trim()).filter(Boolean),
      immediate_actions: form.immediate_actions.split('\n').map((s) => s.trim()).filter(Boolean),
      long_term_actions: form.long_term_actions.split('\n').map((s) => s.trim()).filter(Boolean),
      escalation_trigger: form.escalation_trigger.trim() || null,
    };

    try {
      const url = editEntry ? `/api/playbook/${editEntry.problem_key}` : '/api/playbook';
      const method = editEntry ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Fehler beim Speichern');
        setSaving(false);
        return;
      }

      onSaved();
      onClose();
    } catch {
      setError('Netzwerkfehler');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editEntry ? 'Eintrag bearbeiten' : 'Neuer Eintrag'} width="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Problem-Key</label>
            <Input
              value={form.problem_key}
              onChange={(e) => setForm((f) => ({ ...f, problem_key: e.target.value }))}
              placeholder="z.B. low_ctr"
              required
              disabled={!!editEntry}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Titel</label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Kurzer Titel"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-1">Beschreibung</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 min-h-[80px] resize-y"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Was bedeutet dieses Problem?"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-1">Ursachen <span className="font-normal text-gray-400">(eine pro Zeile)</span></label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 min-h-[80px] resize-y"
            value={form.causes}
            onChange={(e) => setForm((f) => ({ ...f, causes: e.target.value }))}
            placeholder="Ursache 1&#10;Ursache 2"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-1">Sofort-Maßnahmen <span className="font-normal text-gray-400">(eine pro Zeile)</span></label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 min-h-[80px] resize-y"
            value={form.immediate_actions}
            onChange={(e) => setForm((f) => ({ ...f, immediate_actions: e.target.value }))}
            placeholder="Schritt 1&#10;Schritt 2"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-1">Langfristige Maßnahmen <span className="font-normal text-gray-400">(eine pro Zeile)</span></label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 min-h-[80px] resize-y"
            value={form.long_term_actions}
            onChange={(e) => setForm((f) => ({ ...f, long_term_actions: e.target.value }))}
            placeholder="Maßnahme 1&#10;Maßnahme 2"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-1">Eskalations-Trigger <span className="font-normal text-gray-400">(optional)</span></label>
          <Input
            value={form.escalation_trigger}
            onChange={(e) => setForm((f) => ({ ...f, escalation_trigger: e.target.value }))}
            placeholder="Wann eskalieren?"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Speichert...' : editEntry ? 'Aktualisieren' : 'Erstellen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function PlaybookPage() {
  const [tab, setTab] = useState<'aufgaben' | 'wissen'>('aufgaben');

  // --- Kanban state ---
  const [tasks, setTasks] = useState<TaskWithMeta[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  // --- Wissensdatenbank state ---
  const [entries, setEntries] = useState<PlaybookEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<PlaybookEntry | null>(null);

  // Fetch tasks and agency names
  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const [tasksRes, agenciesRes] = await Promise.all([
        fetch('/api/playbook-tasks'),
        fetch('/api/admin/agencies').catch(() => ({ ok: false, json: async () => [] })),
      ]);
      const tasksData: PlaybookTask[] = tasksRes.ok ? await tasksRes.json() : [];
      const agenciesData: { id: string; name: string }[] = (agenciesRes as Response).ok
        ? await (agenciesRes as Response).json()
        : [];

      const agencyMap = new Map(agenciesData.map((a) => [a.id, a.name]));
      setTasks(
        tasksData.map((t) => ({
          ...t,
          agency_name: agencyMap.get(t.agency_id) ?? undefined,
        }))
      );
    } catch {
      // ignore
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const fetchEntries = useCallback(() => {
    fetch('/api/playbook')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEntries(data);
        setEntriesLoading(false);
      })
      .catch(() => setEntriesLoading(false));
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchEntries();
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => { if (data.role === 'admin') setIsAdmin(true); })
      .catch(() => {});
  }, [fetchTasks, fetchEntries]);

  async function handleStatusChange(id: string, status: PlaybookTask['status']) {
    await fetch(`/api/playbook-tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status, completed_at: status === 'done' ? new Date().toISOString() : null }
          : t
      )
    );
  }

  function handleEdit(entry: PlaybookEntry) {
    setEditEntry(entry);
    setModalOpen(true);
  }

  async function handleDelete(entry: PlaybookEntry) {
    if (!confirm(`Eintrag "${entry.title}" wirklich löschen?`)) return;
    const res = await fetch(`/api/playbook/${entry.problem_key}`, { method: 'DELETE' });
    if (res.ok) setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  }

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    return !q || e.title.toLowerCase().includes(q) || e.problem_key.toLowerCase().includes(q) || e.description.toLowerCase().includes(q);
  });

  const openCount = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length;

  return (
    <div>
      <PageHeader
        label="WERKZEUGE"
        title="Playbook"
        description="Aufgaben aus erkannten Problemen und Handlungsempfehlungen"
        action={
          tab === 'wissen' && isAdmin ? (
            <Button size="sm" onClick={() => { setEditEntry(null); setModalOpen(true); }}>
              <Plus className="w-4 h-4" />
              Neuer Eintrag
            </Button>
          ) : undefined
        }
      />

      {/* Tab switcher */}
      <div className="mb-8">
        <SegmentedControl
          items={[
            { value: 'aufgaben', label: `Aufgaben${openCount > 0 ? ` (${openCount})` : ''}` },
            { value: 'wissen',   label: 'Wissensdatenbank' },
          ]}
          value={tab}
          onChange={(v) => setTab(v as 'aufgaben' | 'wissen')}
        />
      </div>

      {/* ── Aufgaben Tab ── */}
      {tab === 'aufgaben' && (
        <>
          {tasksLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
            </div>
          ) : tasks.length === 0 ? (
            <Card padding="lg">
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <ClipboardList className="w-10 h-10 text-gray-300" />
                <p className="text-sm text-gray-400">Noch keine Playbook-Aufgaben vorhanden.</p>
                <p className="text-xs text-gray-300">Aufgaben werden automatisch generiert, wenn Probleme erkannt werden.</p>
              </div>
            </Card>
          ) : (
            <KanbanBoard tasks={tasks} onStatusChange={handleStatusChange} />
          )}
        </>
      )}

      {/* ── Wissensdatenbank Tab ── */}
      {tab === 'wissen' && (
        <>
          {entriesLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="mb-8 max-w-sm">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Suchen..."
                  icon={<Search className="w-4 h-4" />}
                />
              </div>
              <div className="space-y-4">
                {filtered.length === 0 ? (
                  <Card padding="lg">
                    <p className="text-center text-sm text-gray-400">
                      {search ? `Keine Einträge für "${search}"` : 'Keine Playbook-Einträge vorhanden.'}
                    </p>
                  </Card>
                ) : (
                  filtered.map((entry) => (
                    <AccordionItem
                      key={entry.id}
                      entry={entry}
                      isAdmin={isAdmin}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </>
      )}

      <PlaybookFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditEntry(null); }}
        onSaved={fetchEntries}
        editEntry={editEntry}
      />
    </div>
  );
}
