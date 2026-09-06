'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import type { ProjectTask, TaskCheckitem, ContentLibraryItem } from '@/lib/types/database';
import {
  ShieldCheck, Check, X, ExternalLink, Clock,
  ChevronDown, ChevronUp, Loader2, LinkIcon,
  FileText, Send, CheckCheck,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FreigabeTask extends ProjectTask {
  task_checkitems: TaskCheckitem[];
  agencies: { id: string; name: string } | null;
}

interface FreigabeContent extends ContentLibraryItem {
  agencies: { id: string; name: string } | null;
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  ad_copy: 'Ad Copy',
  phone_script: 'Telefonskript',
  video_script: 'Videoskript',
  funnel_text: 'Funnel-Text',
  job_posting: 'Stellenanzeige',
  creative_brief: 'Creative Brief',
};

/* ------------------------------------------------------------------ */
/*  Content Row (Batch-Ansicht)                                        */
/* ------------------------------------------------------------------ */

function ContentRow({
  item,
  selected,
  onToggleSelect,
  onAction,
  primaryLabel,
  primaryStatus,
  rejectLabel,
  rejectStatus,
}: {
  item: FreigabeContent;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onAction: (id: string, status: string, feedback?: string) => Promise<void>;
  primaryLabel: string;
  primaryStatus: string;
  rejectLabel?: string;
  rejectStatus?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNotiz, setRejectNotiz] = useState('');
  const [processing, setProcessing] = useState(false);

  async function run(status: string, feedback?: string) {
    setProcessing(true);
    try {
      await onAction(item.id, status, feedback);
    } catch {
      toast.error('Aktion fehlgeschlagen.');
    } finally {
      setProcessing(false);
      setRejecting(false);
      setRejectNotiz('');
    }
  }

  return (
    <div className="border border-gray-100 rounded-lg">
      <div className="flex items-center gap-3 p-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(item.id)}
          className="w-4 h-4 accent-red-600 flex-shrink-0 cursor-pointer"
        />
        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm font-semibold text-gray-900 hover:text-red-600 transition-colors truncate block text-left cursor-pointer"
          >
            {item.title}
          </button>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">
              {CONTENT_TYPE_LABELS[item.content_type] ?? item.content_type}
            </span>
            {item.variant && <span className="text-xs text-gray-400">· {item.variant}</span>}
            <span className="text-xs text-gray-400">· v{item.version}</span>
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {!rejecting && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button size="sm" onClick={() => run(primaryStatus)} disabled={processing}>
              {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {primaryLabel}
            </Button>
            {rejectStatus && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setRejecting(true)}
                disabled={processing}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="mx-3 mb-3 bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.content}</p>
        </div>
      )}

      {rejecting && rejectStatus && (
        <div className="flex items-center gap-2 px-3 pb-3">
          <Input
            value={rejectNotiz}
            onChange={(e) => setRejectNotiz(e.target.value)}
            placeholder="Grund / Feedback..."
            className="flex-1"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => run(rejectStatus, rejectNotiz.trim() || undefined)}
            disabled={processing}
          >
            {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : rejectLabel}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setRejecting(false); setRejectNotiz(''); }}>
            Abbrechen
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Content Section (gruppiert nach Agentur, mit Batch-Aktionen)       */
/* ------------------------------------------------------------------ */

function ContentSection({
  title,
  description,
  items,
  primaryLabel,
  primaryStatus,
  rejectLabel,
  rejectStatus,
  batchLabel,
  onAction,
}: {
  title: string;
  description: string;
  items: FreigabeContent[];
  primaryLabel: string;
  primaryStatus: string;
  rejectLabel?: string;
  rejectStatus?: string;
  batchLabel: string;
  onAction: (id: string, status: string, feedback?: string) => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);

  // Nach Agentur gruppieren
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; items: FreigabeContent[] }>();
    for (const item of items) {
      const key = item.agency_id;
      const name = item.agencies?.name ?? item.agency_id.slice(0, 8);
      if (!map.has(key)) map.set(key, { name, items: [] });
      map.get(key)!.items.push(item);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))
    );
  }

  async function runBatch() {
    const ids = [...selectedIds].filter((id) => items.some((i) => i.id === id));
    if (ids.length === 0) return;
    setBatchRunning(true);
    const results = await Promise.allSettled(ids.map((id) => onAction(id, primaryStatus)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    setBatchRunning(false);
    setSelectedIds(new Set());
    if (failed > 0) toast.error(`${failed} von ${ids.length} fehlgeschlagen.`);
    else toast.success(`${ids.length} Inhalte verarbeitet.`);
  }

  if (items.length === 0) return null;

  const selectedCount = [...selectedIds].filter((id) => items.some((i) => i.id === id)).length;

  return (
    <Card padding="sm" className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={selectedCount === items.length && items.length > 0}
          onChange={toggleAll}
          className="w-4 h-4 accent-red-600 cursor-pointer"
        />
        <div className="flex-1">
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-400">{description}</p>
        </div>
        <Badge tone="softAccent">{items.length}</Badge>
        {selectedCount > 0 && (
          <Button size="sm" onClick={runBatch} disabled={batchRunning}>
            {batchRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCheck className="w-3.5 h-3.5" />
            )}
            {batchLabel} ({selectedCount})
          </Button>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.name} className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{group.name}</p>
          {group.items.map((item) => (
            <ContentRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onToggleSelect={toggleSelect}
              onAction={onAction}
              primaryLabel={primaryLabel}
              primaryStatus={primaryStatus}
              rejectLabel={rejectLabel}
              rejectStatus={rejectStatus}
            />
          ))}
        </div>
      ))}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Freigabe Card (Projekt-Aufgaben)                                   */
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
  const [contentItems, setContentItems] = useState<FreigabeContent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [tasksRes, contentRes] = await Promise.all([
        fetch('/api/project-tasks?status=zur_freigabe'),
        fetch('/api/library?status=internal_review,approved_internal,approved'),
      ]);
      const tasksData = await tasksRes.json();
      const contentData = await contentRes.json();
      if (Array.isArray(tasksData)) setTasks(tasksData);
      if (Array.isArray(contentData)) setContentItems(contentData);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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

  async function handleContentAction(contentId: string, status: string, feedback?: string) {
    const body: Record<string, unknown> = { status };
    if (feedback) body.feedback = feedback;
    const res = await fetch(`/api/library/${contentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Fehler');
    }
    // Item aus der aktuellen Sektion entfernen bzw. Status aktualisieren
    setContentItems((prev) =>
      status === 'approved_internal'
        ? prev.map((i) => (i.id === contentId ? { ...i, status: 'approved_internal' as const } : i))
        : prev.filter((i) => i.id !== contentId)
    );
  }

  const internalReview = contentItems.filter((i) => i.status === 'internal_review');
  const readyForClient = contentItems.filter((i) => i.status === 'approved_internal');
  const assetHalde = contentItems.filter((i) => i.status === 'approved');
  const totalOpen = tasks.length + internalReview.length + readyForClient.length;
  const totalItems = totalOpen + assetHalde.length;

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
        description="Inhalte und Aufgaben zentral prüfen und im Batch freigeben"
        counter={`${totalOpen} offen`}
      />

      {totalItems === 0 ? (
        <Card padding="lg" className="text-center">
          <ShieldCheck className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Alles freigegeben</h2>
          <p className="text-gray-600">
            Keine Inhalte oder Aufgaben warten aktuell auf Freigabe.
          </p>
        </Card>
      ) : (
        <>
          {/* Inhalte: interne Prüfung */}
          <ContentSection
            title="Inhalte zur internen Prüfung"
            description="KI-generierte Inhalte prüfen und intern freigeben"
            items={internalReview}
            primaryLabel="Freigeben"
            primaryStatus="approved_internal"
            rejectLabel="Zurück an Entwurf"
            rejectStatus="draft"
            batchLabel="Alle freigeben"
            onAction={handleContentAction}
          />

          {/* Inhalte: bereit für Kunde */}
          <ContentSection
            title="Bereit für Kundenfreigabe"
            description="Intern freigegebene Inhalte an Kunden senden"
            items={readyForClient}
            primaryLabel="An Kunde"
            primaryStatus="client_review"
            rejectLabel="Zurück zur Prüfung"
            rejectStatus="internal_review"
            batchLabel="Alle senden"
            onAction={handleContentAction}
          />
          {readyForClient.length > 0 && (
            <p className="text-xs text-gray-400 -mt-4 flex items-center gap-1">
              <Send className="w-3 h-3" />
              Kunden sehen Inhalte in ihrem Portal unter Freigaben.
            </p>
          )}

          {/* Asset-Halde: vom Kunden freigegeben, bereit zum Aktivieren */}
          <ContentSection
            title="Asset-Halde"
            description="Vom Kunden freigegebene Inhalte — bereit zum Aktivieren"
            items={assetHalde}
            primaryLabel="Aktivieren"
            primaryStatus="deployed"
            batchLabel="Alle aktivieren"
            onAction={handleContentAction}
          />

          {/* Projekt-Aufgaben */}
          {tasks.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-gray-900">Aufgaben zur Freigabe</h2>
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
        </>
      )}
    </div>
  );
}
