'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import type { ProjectTask, ProjectTaskStatus, TaskCheckitem, TaskTemplate, AccessItem, ClientProfile } from '@/lib/types/database';
import type { UserRole } from '@/lib/auth';
import {
  ArrowLeft, Clock, CheckCircle2, Circle, Loader2,
  Ban, ShieldCheck, ExternalLink, AlertTriangle,
  Link as LinkIcon, FileText, Check, X, Play,
  ChevronRight,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TaskDetailData extends ProjectTask {
  task_checkitems: TaskCheckitem[];
  agencies: { id: string; name: string } | null;
  task_templates: TaskTemplate | null;
  access_items: AccessItem[] | null;
  client_profile: ClientProfile | null;
}

/* ------------------------------------------------------------------ */
/*  Status config                                                      */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<ProjectTaskStatus, { label: string; tone: 'accent' | 'softAccent' | 'success' | 'neutral' | 'outline'; icon: typeof Circle }> = {
  blockiert: { label: 'Blockiert', tone: 'accent', icon: Ban },
  offen: { label: 'Offen', tone: 'neutral', icon: Circle },
  in_arbeit: { label: 'In Arbeit', tone: 'softAccent', icon: Loader2 },
  zur_freigabe: { label: 'Zur Freigabe', tone: 'outline', icon: ShieldCheck },
  erledigt: { label: 'Erledigt', tone: 'success', icon: CheckCircle2 },
  nicht_noetig: { label: 'Nicht noetig', tone: 'neutral', icon: Ban },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatFristRelative(dateStr: string | null): { text: string; isOverdue: boolean } {
  if (!dateStr) return { text: 'Keine Frist', isOverdue: false };
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = date.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < -1) return { text: `${Math.abs(diffDays)} Tage ueberfaellig`, isOverdue: true };
  if (diffDays === -1) return { text: 'Seit gestern ueberfaellig', isOverdue: true };
  if (diffDays === 0) return { text: 'Heute faellig', isOverdue: false };
  if (diffDays === 1) return { text: 'Morgen faellig', isOverdue: false };
  return { text: `In ${diffDays} Tagen faellig`, isOverdue: false };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface TaskDetailClientProps {
  taskId: string;
  userRole: UserRole;
  userId: string;
}

export function TaskDetailClient({ taskId, userRole, userId }: TaskDetailClientProps) {
  const router = useRouter();
  const [task, setTask] = useState<TaskDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [ergebnisUrl, setErgebnisUrl] = useState('');
  const [ergebnisText, setErgebnisText] = useState('');
  const [nichtNoetigNotiz, setNichtNoetigNotiz] = useState('');
  const [showNichtNoetig, setShowNichtNoetig] = useState(false);
  const isAdmin = userRole === 'admin';

  const fetchTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/project-tasks/${taskId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTask(data);
      setErgebnisUrl(data.ergebnis_url || '');
      setErgebnisText(data.ergebnis_text || '');
    } catch {
      toast.error('Aufgabe konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  /* ---- Status transition ---- */
  async function updateStatus(newStatus: ProjectTaskStatus, extraFields?: Record<string, unknown>) {
    if (!task) return;
    setUpdating(true);
    try {
      const body: Record<string, unknown> = { status: newStatus, ...extraFields };

      // Save ergebnis fields before transition if needed
      if (ergebnisUrl && ergebnisUrl !== task.ergebnis_url) body.ergebnis_url = ergebnisUrl;
      if (ergebnisText && ergebnisText !== task.ergebnis_text) body.ergebnis_text = ergebnisText;

      const res = await fetch(`/api/project-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Fehler');
      }

      toast.success(
        newStatus === 'erledigt' ? 'Aufgabe erledigt!' :
        newStatus === 'in_arbeit' ? 'Aufgabe gestartet' :
        newStatus === 'zur_freigabe' ? 'Zur Freigabe eingereicht' :
        newStatus === 'nicht_noetig' ? 'Als nicht noetig markiert' :
        'Status aktualisiert'
      );

      await fetchTask();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler beim Aktualisieren');
    } finally {
      setUpdating(false);
    }
  }

  /* ---- Save ergebnis ---- */
  async function saveErgebnis() {
    if (!task) return;
    setUpdating(true);
    try {
      const body: Record<string, unknown> = {};
      if (ergebnisUrl !== (task.ergebnis_url || '')) body.ergebnis_url = ergebnisUrl || null;
      if (ergebnisText !== (task.ergebnis_text || '')) body.ergebnis_text = ergebnisText || null;

      if (Object.keys(body).length === 0) {
        toast.error('Keine Aenderungen.');
        return;
      }

      const res = await fetch(`/api/project-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Fehler');
      }

      toast.success('Ergebnis gespeichert.');
      await fetchTask();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler beim Speichern');
    } finally {
      setUpdating(false);
    }
  }

  /* ---- Toggle checkitem ---- */
  async function toggleCheckitem(checkitemId: string, currentState: boolean) {
    if (!task) return;
    try {
      const res = await fetch(`/api/project-tasks/${taskId}/checkitems`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkitem_id: checkitemId, erledigt: !currentState }),
      });
      if (!res.ok) throw new Error();

      // Optimistic update
      setTask((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          task_checkitems: prev.task_checkitems.map((c) =>
            c.id === checkitemId
              ? { ...c, erledigt: !currentState, erledigt_am: !currentState ? new Date().toISOString() : null, erledigt_von: !currentState ? userId : null }
              : c
          ),
        };
      });
    } catch {
      toast.error('Checkitem konnte nicht aktualisiert werden.');
    }
  }

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-24">
        <p className="text-gray-600">Aufgabe nicht gefunden.</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.push('/aufgaben')}>
          <ArrowLeft className="w-4 h-4" /> Zurueck
        </Button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[task.status];
  const frist = formatFristRelative(task.faellig_am);
  const checkitems = (task.task_checkitems || []).sort((a, b) => a.reihenfolge - b.reihenfolge);
  const allChecksDone = checkitems.length === 0 || checkitems.every((c) => c.erledigt);
  const hasErgebnis = !!(ergebnisUrl || ergebnisText || task.ergebnis_url || task.ergebnis_text);
  const template = task.task_templates;
  const accessItems = task.access_items || [];
  const hasUnfulfilledAccess = accessItems.some((a) => a.pflicht && a.status !== 'erfuellt');
  const clientProfile = task.client_profile;
  const isContentTask = template?.owner_funktion === 'content' || template?.abgabe_typ === 'link' || template?.abgabe_typ === 'text';
  const isDone = task.status === 'erledigt' || task.status === 'nicht_noetig';

  return (
    <div className="max-w-3xl space-y-6">
      {/* Back link */}
      <button
        onClick={() => router.push('/aufgaben')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Alle Aufgaben
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">{task.titel}</h1>
          {task.agencies && (
            <Link
              href={`/clients/${task.agency_id}`}
              className="text-sm text-gray-500 hover:text-red-600 transition-colors flex items-center gap-1"
            >
              {task.agencies.name}
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge tone={statusCfg.tone}>{statusCfg.label}</Badge>
          {frist.text && (
            <Badge tone={frist.isOverdue ? 'accent' : 'neutral'}>
              <Clock className="w-3 h-3 mr-1" />
              {frist.text}
            </Badge>
          )}
        </div>
      </div>

      {/* Description */}
      {task.beschreibung && (
        <Card padding="sm" inset>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{task.beschreibung}</p>
        </Card>
      )}

      {/* Access items warning */}
      {hasUnfulfilledAccess && task.status === 'offen' && (
        <Card padding="sm" className="!border-amber-200 !bg-amber-50/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Fehlende Zugaenge</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Diese Aufgabe erfordert Zugaenge, die noch nicht bereitgestellt wurden. Die Aufgabe kann nicht gestartet werden.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Benoetigte Zugaenge */}
      {accessItems.length > 0 && (
        <Card padding="sm">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Benoetigte Zugaenge</h3>
          <div className="space-y-2">
            {accessItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 text-sm"
              >
                {item.status === 'erfuellt' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-red-400 flex-shrink-0" />
                )}
                <span className={item.status === 'erfuellt' ? 'text-gray-500' : 'text-gray-900 font-medium'}>
                  {item.label}
                </span>
                {item.pflicht && item.status !== 'erfuellt' && (
                  <Badge tone="accent" className="text-[10px]">Pflicht</Badge>
                )}
                {item.anleitung_url && (
                  <a
                    href={item.anleitung_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-red-600 hover:text-red-700 ml-auto flex items-center gap-0.5"
                  >
                    Anleitung <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Checkliste */}
      {checkitems.length > 0 && (
        <Card padding="sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Checkliste</h3>
            <span className="text-xs text-gray-400 font-medium tabular-nums">
              {checkitems.filter((c) => c.erledigt).length}/{checkitems.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {checkitems.map((item) => (
              <label
                key={item.id}
                className={`flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  isDone ? 'cursor-default' : 'hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.erledigt}
                  onChange={() => !isDone && toggleCheckitem(item.id, item.erledigt)}
                  disabled={isDone}
                  className="w-4 h-4 accent-red-600 cursor-pointer disabled:cursor-default"
                />
                <span className={`text-sm transition-colors ${item.erledigt ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        </Card>
      )}

      {/* Vorlagen / Templates */}
      {template?.vorlagen_links && template.vorlagen_links.length > 0 && (
        <Card padding="sm">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Vorlagen</h3>
          <div className="space-y-2">
            {template.vorlagen_links.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 transition-colors"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                {url.replace(/^https?:\/\//, '').slice(0, 60)}
                <ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Kundendaten (for content tasks) */}
      {isContentTask && clientProfile && (
        <Card padding="sm">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Kundendaten</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {clientProfile.provisionsmodell && (
              <div>
                <p className="text-xs text-gray-400 font-medium">Provisionsmodell</p>
                <p className="text-sm text-gray-900">{clientProfile.provisionsmodell}</p>
              </div>
            )}
            {clientProfile.verdienstspanne && (
              <div>
                <p className="text-xs text-gray-400 font-medium">Verdienstspanne</p>
                <p className="text-sm text-gray-900">{clientProfile.verdienstspanne}</p>
              </div>
            )}
            {clientProfile.alleinstellung && (
              <div className="sm:col-span-2">
                <p className="text-xs text-gray-400 font-medium">Alleinstellung</p>
                <p className="text-sm text-gray-900">{clientProfile.alleinstellung}</p>
              </div>
            )}
            {clientProfile.verbotene_claims && (
              <div className="sm:col-span-2">
                <p className="text-xs text-gray-400 font-medium">Verbotene Claims</p>
                <p className="text-sm text-red-600 font-medium">{clientProfile.verbotene_claims}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Abgabefeld */}
      {!isDone && task.status !== 'blockiert' && (
        <Card padding="sm">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            {template?.abgabe_typ === 'link' ? 'Ergebnis-Link' :
             template?.abgabe_typ === 'text' ? 'Ergebnis-Text' :
             'Ergebnis'}
          </h3>
          {(template?.abgabe_typ === 'link' || !template?.abgabe_typ || template?.abgabe_typ === 'datei') && (
            <div className="space-y-3">
              <Input
                value={ergebnisUrl}
                onChange={(e) => setErgebnisUrl(e.target.value)}
                placeholder="https://..."
                icon={<LinkIcon className="w-4 h-4" />}
              />
            </div>
          )}
          {(template?.abgabe_typ === 'text' || !template?.abgabe_typ) && (
            <div className="mt-3">
              <textarea
                value={ergebnisText}
                onChange={(e) => setErgebnisText(e.target.value)}
                placeholder="Ergebnis hier eingeben..."
                rows={4}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none resize-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
            </div>
          )}
          {(ergebnisUrl !== (task.ergebnis_url || '') || ergebnisText !== (task.ergebnis_text || '')) && (
            <div className="mt-3">
              <Button size="sm" variant="secondary" onClick={saveErgebnis} disabled={updating}>
                Ergebnis speichern
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Definition of Done */}
      {template?.definition_of_done && (
        <Card padding="sm" inset>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Definition of Done</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{template.definition_of_done}</p>
        </Card>
      )}

      {/* Existing result (when done) */}
      {isDone && (task.ergebnis_url || task.ergebnis_text) && (
        <Card padding="sm">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Abgegebenes Ergebnis</h3>
          {task.ergebnis_url && (
            <a
              href={task.ergebnis_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 transition-colors mb-2"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              {task.ergebnis_url}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {task.ergebnis_text && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
              {task.ergebnis_text}
            </p>
          )}
        </Card>
      )}

      {/* Notiz (when nicht_noetig) */}
      {task.status === 'nicht_noetig' && task.notiz && (
        <Card padding="sm" inset>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notiz</h3>
          <p className="text-sm text-gray-700">{task.notiz}</p>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap pt-2 pb-8">
        {task.status === 'offen' && (
          <Button
            onClick={() => updateStatus('in_arbeit')}
            disabled={updating || hasUnfulfilledAccess}
          >
            <Play className="w-4 h-4" /> Starten
          </Button>
        )}

        {task.status === 'in_arbeit' && task.freigabe_noetig && (
          <Button
            onClick={() => updateStatus('zur_freigabe')}
            disabled={updating || !allChecksDone || !hasErgebnis}
          >
            <ShieldCheck className="w-4 h-4" /> Zur Freigabe
          </Button>
        )}

        {task.status === 'in_arbeit' && !task.freigabe_noetig && (
          <Button
            onClick={() => updateStatus('erledigt')}
            disabled={updating || !allChecksDone || !hasErgebnis}
          >
            <CheckCircle2 className="w-4 h-4" /> Erledigt
          </Button>
        )}

        {task.status === 'zur_freigabe' && isAdmin && (
          <>
            <Button
              onClick={() => updateStatus('erledigt')}
              disabled={updating}
            >
              <Check className="w-4 h-4" /> Freigeben
            </Button>
            <Button
              variant="secondary"
              onClick={() => updateStatus('in_arbeit')}
              disabled={updating}
            >
              <X className="w-4 h-4" /> Zurueckweisen
            </Button>
          </>
        )}

        {!isDone && isAdmin && !showNichtNoetig && (
          <Button
            variant="ghost"
            onClick={() => setShowNichtNoetig(true)}
            disabled={updating}
          >
            <Ban className="w-4 h-4" /> Nicht noetig
          </Button>
        )}

        {showNichtNoetig && (
          <div className="flex items-center gap-2 w-full">
            <Input
              value={nichtNoetigNotiz}
              onChange={(e) => setNichtNoetigNotiz(e.target.value)}
              placeholder="Grund eingeben..."
              className="flex-1"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!nichtNoetigNotiz.trim()) {
                  toast.error('Bitte einen Grund eingeben.');
                  return;
                }
                updateStatus('nicht_noetig', { notiz: nichtNoetigNotiz });
                setShowNichtNoetig(false);
              }}
              disabled={updating}
            >
              Bestaetigen
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowNichtNoetig(false); setNichtNoetigNotiz(''); }}
            >
              Abbrechen
            </Button>
          </div>
        )}

        {/* Validation messages */}
        {task.status === 'in_arbeit' && (
          <div className="w-full">
            {!allChecksDone && (
              <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" />
                Alle Checkitems muessen abgehakt sein.
              </p>
            )}
            {!hasErgebnis && (
              <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" />
                Ein Ergebnis (Link oder Text) ist erforderlich.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Meta info */}
      <Card padding="sm" inset>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-gray-400 font-medium">Erstellt</p>
            <p className="text-gray-700">{formatDate(task.created_at)}</p>
          </div>
          {task.gestartet_am && (
            <div>
              <p className="text-gray-400 font-medium">Gestartet</p>
              <p className="text-gray-700">{formatDate(task.gestartet_am)}</p>
            </div>
          )}
          {task.erledigt_am && (
            <div>
              <p className="text-gray-400 font-medium">Erledigt</p>
              <p className="text-gray-700">{formatDate(task.erledigt_am)}</p>
            </div>
          )}
          <div>
            <p className="text-gray-400 font-medium">Faellig</p>
            <p className={`${frist.isOverdue ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
              {formatDate(task.faellig_am)}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
