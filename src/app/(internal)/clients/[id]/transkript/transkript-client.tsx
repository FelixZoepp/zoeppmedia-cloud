'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import {
  ArrowLeft, Upload, FileText, CheckCircle, Edit3, HelpCircle,
  AlertCircle, ChevronUp, Loader2,
} from 'lucide-react';

/* ── Types ───────────────────────────────────────────────── */

interface Transcript {
  id: string;
  agency_id: string;
  typ: string;
  quelle: string;
  volltext: string | null;
  status: string;
  created_at: string;
}

interface TranscriptAnswer {
  id: string;
  transcript_id: string;
  frage_key: string;
  frage_text: string;
  antwort: string;
  zitat: string;
  sicherheit: 'hoch' | 'mittel' | 'niedrig' | 'nicht_gefunden';
  ziel_feld: string | null;
  status: 'offen' | 'bestaetigt' | 'korrigiert' | 'nachfragen';
  korrigierter_wert: string | null;
}

interface Props {
  agencyId: string;
  userId: string;
  userName: string;
}

const SICHERHEIT_CONFIG = {
  hoch: { label: 'Hoch', tone: 'success' as const, color: 'text-green-700 bg-green-50' },
  mittel: { label: 'Mittel', tone: 'softAccent' as const, color: 'text-amber-700 bg-amber-50' },
  niedrig: { label: 'Niedrig', tone: 'accent' as const, color: 'text-red-700 bg-red-50' },
  nicht_gefunden: { label: 'Nicht gefunden', tone: 'neutral' as const, color: 'text-gray-500 bg-gray-100' },
};

const STATUS_LABELS: Record<string, string> = {
  hochgeladen: 'Hochgeladen',
  transkribiert: 'Transkribiert',
  ausgewertet: 'Ausgewertet',
  geprueft: 'Geprüft',
};

const TYP_LABELS: Record<string, string> = {
  onboarding: 'Onboarding',
  kickoff: 'Kickoff',
  tracking_call: 'Tracking Call',
  closing: 'Closing',
};

/* ── Upload Section ──────────────────────────────────────── */

function UploadSection({ agencyId, onUploaded }: { agencyId: string; onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [typ, setTyp] = useState('onboarding');
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('agency_id', agencyId);
    formData.append('typ', typ);

    try {
      const res = await fetch('/api/transcripts', { method: 'POST', body: formData });
      if (res.ok) {
        onUploaded();
      }
    } catch {
      // Ignore
    }
    setUploading(false);
  }

  async function handlePasteSubmit() {
    if (!pasteText.trim()) return;
    setUploading(true);
    try {
      const res = await fetch('/api/transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency_id: agencyId, typ, volltext: pasteText }),
      });
      if (res.ok) {
        setPasteText('');
        onUploaded();
      }
    } catch {
      // Ignore
    }
    setUploading(false);
  }

  return (
    <Card padding="lg" className="mb-6">
      <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
        Transkript hochladen
      </h2>

      <div className="flex items-center gap-4 mb-4">
        <label className="text-sm text-gray-600 font-medium">Typ:</label>
        <select
          value={typ}
          onChange={(e) => setTyp(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
        >
          <option value="onboarding">Onboarding</option>
          <option value="kickoff">Kickoff</option>
          <option value="tracking_call">Tracking Call</option>
          <option value="closing">Closing</option>
        </select>
      </div>

      <div className="flex gap-3 mb-4">
        <Button
          variant={pasteMode ? 'ghost' : 'soft'}
          size="sm"
          onClick={() => setPasteMode(false)}
        >
          <Upload size={14} />
          Datei hochladen
        </Button>
        <Button
          variant={pasteMode ? 'soft' : 'ghost'}
          size="sm"
          onClick={() => setPasteMode(true)}
        >
          <FileText size={14} />
          Text einfügen
        </Button>
      </div>

      {pasteMode ? (
        <div className="space-y-3">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Transkript-Text hier einfügen..."
            rows={8}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white resize-y focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-300"
          />
          <Button onClick={handlePasteSubmit} disabled={uploading || !pasteText.trim()} size="sm">
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Wird verarbeitet...
              </>
            ) : (
              'Transkript speichern'
            )}
          </Button>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-red-300 hover:bg-red-50/30 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,video/*,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 size={20} className="animate-spin text-red-600" />
              <span className="text-sm text-gray-600">Wird hochgeladen und verarbeitet...</span>
            </div>
          ) : (
            <>
              <Upload size={24} className="mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-600">Audio, Video oder Textdatei hierher ziehen</p>
              <p className="text-xs text-gray-400 mt-1">MP3, M4A, WAV, MP4, TXT</p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/* ── Answer Card ─────────────────────────────────────────── */

function AnswerCard({
  answer,
  index,
  transcriptId,
  onUpdate,
  onQuoteClick,
}: {
  answer: TranscriptAnswer;
  index: number;
  transcriptId: string;
  onUpdate: (updated: TranscriptAnswer) => void;
  onQuoteClick: (quote: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(answer.korrigierter_wert || answer.antwort);
  const [saving, setSaving] = useState(false);

  const config = SICHERHEIT_CONFIG[answer.sicherheit];

  async function updateStatus(status: string, korrigierterWert?: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer_id: answer.id,
          status,
          ...(korrigierterWert !== undefined ? { korrigierter_wert: korrigierterWert } : {}),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
        setEditing(false);
      }
    } catch {
      // Ignore
    }
    setSaving(false);
  }

  const statusIcon = {
    offen: null,
    bestaetigt: <CheckCircle size={14} className="text-green-600" />,
    korrigiert: <Edit3 size={14} className="text-blue-600" />,
    nachfragen: <HelpCircle size={14} className="text-amber-600" />,
  }[answer.status];

  const statusBg = {
    offen: 'border-gray-200',
    bestaetigt: 'border-green-200 bg-green-50/30',
    korrigiert: 'border-blue-200 bg-blue-50/30',
    nachfragen: 'border-amber-200 bg-amber-50/30',
  }[answer.status];

  return (
    <div className={`p-4 rounded-xl border ${statusBg} transition-colors`}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">{answer.frage_text}</p>
            {statusIcon}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge tone={config.tone}>{config.label}</Badge>
            {answer.status !== 'offen' && (
              <span className="text-xs text-gray-400">
                {answer.status === 'bestaetigt' ? 'Bestätigt' : answer.status === 'korrigiert' ? 'Korrigiert' : 'Nachfragen'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Answer */}
      <div className="ml-9">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white resize-y focus:outline-none focus:ring-2 focus:ring-red-500/20"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={saving}
                onClick={() => updateStatus('korrigiert', editValue)}
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : null}
                Korrektur speichern
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-900 mb-2">
              {answer.korrigierter_wert || answer.antwort || '—'}
            </p>

            {/* Quote */}
            {answer.zitat && (
              <button
                onClick={() => onQuoteClick(answer.zitat)}
                className="text-xs text-gray-500 italic hover:text-red-600 transition-colors cursor-pointer text-left"
              >
                &ldquo;{answer.zitat}&rdquo;
              </button>
            )}

            {/* Action buttons */}
            {answer.status === 'offen' && (
              <div className="flex items-center gap-2 mt-3">
                <Button
                  size="sm"
                  variant="soft"
                  disabled={saving}
                  onClick={() => updateStatus('bestaetigt')}
                >
                  <CheckCircle size={12} />
                  Bestätigen
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditValue(answer.korrigierter_wert || answer.antwort);
                    setEditing(true);
                  }}
                >
                  <Edit3 size={12} />
                  Korrigieren
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => updateStatus('nachfragen')}
                >
                  <HelpCircle size={12} />
                  Nachfragen
                </Button>
              </div>
            )}

            {/* Allow re-opening confirmed/korrigiert answers */}
            {(answer.status === 'bestaetigt' || answer.status === 'korrigiert' || answer.status === 'nachfragen') && (
              <div className="flex items-center gap-2 mt-3">
                {answer.status !== 'bestaetigt' && (
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={saving}
                    onClick={() => updateStatus('bestaetigt')}
                  >
                    <CheckCircle size={12} />
                    Bestätigen
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditValue(answer.korrigierter_wert || answer.antwort);
                    setEditing(true);
                  }}
                >
                  <Edit3 size={12} />
                  Bearbeiten
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Transcript Text Panel ───────────────────────────────── */

function TranscriptTextPanel({
  volltext,
  highlightedQuote,
}: {
  volltext: string;
  highlightedQuote: string | null;
}) {
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlightedQuote || !textRef.current) return;

    // Find and scroll to the highlighted quote
    const marks = textRef.current.querySelectorAll('mark');
    if (marks.length > 0) {
      marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedQuote]);

  // Highlight the selected quote in the text
  function renderText() {
    if (!highlightedQuote || !volltext.includes(highlightedQuote)) {
      return <p className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">{volltext}</p>;
    }

    const parts = volltext.split(highlightedQuote);
    return (
      <p className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && (
              <mark className="bg-yellow-200 text-gray-900 px-0.5 rounded">
                {highlightedQuote}
              </mark>
            )}
          </span>
        ))}
      </p>
    );
  }

  return (
    <div ref={textRef} className="overflow-y-auto max-h-[calc(100vh-220px)] pr-2">
      {renderText()}
    </div>
  );
}

/* ── Transcript List ─────────────────────────────────────── */

function TranscriptList({
  transcripts,
  onSelect,
}: {
  transcripts: Transcript[];
  onSelect: (t: Transcript) => void;
}) {
  if (transcripts.length === 0) {
    return (
      <Card padding="lg" className="mb-6">
        <div className="text-center py-6">
          <FileText size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">Noch keine Transkripte vorhanden.</p>
          <p className="text-xs text-gray-400 mt-1">Lade ein Transkript hoch, um zu starten.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="mb-6">
      <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
        Vorhandene Transkripte
      </h2>
      <div className="space-y-3">
        {transcripts.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t)}
            className="w-full flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-red-50/50 transition-colors text-left cursor-pointer"
          >
            <FileText size={16} className="text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {TYP_LABELS[t.typ] || t.typ}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(t.created_at).toLocaleString('de-DE', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
                {' · '}
                {t.quelle === 'einfuegen' ? 'Text' : t.quelle === 'upload_audio' ? 'Audio' : t.quelle === 'upload_video' ? 'Video' : 'Datei'}
              </p>
            </div>
            <Badge
              tone={
                t.status === 'geprueft' ? 'success' :
                t.status === 'ausgewertet' ? 'softAccent' :
                'neutral'
              }
            >
              {STATUS_LABELS[t.status] || t.status}
            </Badge>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ── Main Component ──────────────────────────────────────── */

export function TranskriptClient({ agencyId }: Props) {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);
  const [answers, setAnswers] = useState<TranscriptAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAnswers, setLoadingAnswers] = useState(false);
  const [highlightedQuote, setHighlightedQuote] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // Load transcripts
  const loadTranscripts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transcripts?agency_id=${agencyId}`);
      if (res.ok) {
        const data = await res.json();
        setTranscripts(data);

        // Auto-select the first ausgewertet/geprueft transcript if none selected
        if (!selectedTranscript && data.length > 0) {
          const reviewable = data.find((t: Transcript) => t.status === 'ausgewertet' || t.status === 'geprueft');
          if (reviewable) {
            setSelectedTranscript(reviewable);
          }
        }
      }
    } catch {
      // Ignore
    }
    setLoading(false);
  }, [agencyId, selectedTranscript]);

  // Load answers for selected transcript
  const loadAnswers = useCallback(async (transcriptId: string) => {
    setLoadingAnswers(true);
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}/answers`);
      if (res.ok) {
        const data = await res.json();
        setAnswers(data);
      }
    } catch {
      // Ignore
    }
    setLoadingAnswers(false);
  }, []);

  useEffect(() => {
    loadTranscripts();
  }, [loadTranscripts]);

  useEffect(() => {
    if (selectedTranscript) {
      loadAnswers(selectedTranscript.id);
    }
  }, [selectedTranscript, loadAnswers]);

  function handleAnswerUpdate(updated: TranscriptAnswer) {
    setAnswers((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : a))
    );
  }

  function handleQuoteClick(quote: string) {
    setHighlightedQuote(quote);
  }

  async function handleComplete() {
    if (!selectedTranscript) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/transcripts/${selectedTranscript.id}/complete`, {
        method: 'POST',
      });
      if (res.ok) {
        setSelectedTranscript((prev) => prev ? { ...prev, status: 'geprueft' } : prev);
        loadTranscripts();
      } else {
        const data = await res.json();
        alert(data.error || 'Fehler beim Abschließen');
      }
    } catch {
      alert('Fehler beim Abschließen');
    }
    setCompleting(false);
  }

  // Progress calculations
  const totalAnswers = answers.length;
  const resolvedAnswers = answers.filter(
    (a) => a.status === 'bestaetigt' || a.status === 'korrigiert'
  ).length;

  // Check if all pflicht questions are resolved (we mark pflicht from the frage_key)
  // For now check all answers that are not "nicht_gefunden"
  const canComplete =
    selectedTranscript?.status === 'ausgewertet' &&
    answers.length > 0 &&
    answers.every(
      (a) =>
        a.status === 'bestaetigt' ||
        a.status === 'korrigiert' ||
        a.sicherheit === 'nicht_gefunden'
    );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  // If we have a selected transcript with status ausgewertet/geprueft, show review view
  if (selectedTranscript && (selectedTranscript.status === 'ausgewertet' || selectedTranscript.status === 'geprueft') && selectedTranscript.volltext) {
    return (
      <div>
        {/* Header */}
        <button
          onClick={() => setSelectedTranscript(null)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-500 transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft size={14} />
          Zurück zur Übersicht
        </button>

        <PageHeader
          label="TRANSKRIPT PRÜFEN"
          title={TYP_LABELS[selectedTranscript.typ] || selectedTranscript.typ}
          description={`${new Date(selectedTranscript.created_at).toLocaleString('de-DE')} · ${STATUS_LABELS[selectedTranscript.status]}`}
        />

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Questions + Answers (60%) */}
          <div className="lg:col-span-3 space-y-4">
            {loadingAnswers ? (
              <Card padding="lg">
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-red-600" />
                </div>
              </Card>
            ) : answers.length === 0 ? (
              <Card padding="lg">
                <div className="text-center py-8">
                  <AlertCircle size={24} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm text-gray-500">Keine Antworten vorhanden.</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Es wurden keine Antworten extrahiert.
                  </p>
                </div>
              </Card>
            ) : (
              answers.map((answer, i) => (
                <AnswerCard
                  key={answer.id}
                  answer={answer}
                  index={i}
                  transcriptId={selectedTranscript.id}
                  onUpdate={handleAnswerUpdate}
                  onQuoteClick={handleQuoteClick}
                />
              ))
            )}
          </div>

          {/* Right: Full text (40%) */}
          <div className="lg:col-span-2">
            <Card padding="lg" className="sticky top-4">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
                Volltext
              </h3>
              <TranscriptTextPanel
                volltext={selectedTranscript.volltext}
                highlightedQuote={highlightedQuote}
              />
            </Card>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="sticky bottom-0 mt-6 -mx-4 px-4 py-4 bg-white/95 backdrop-blur border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{resolvedAnswers}</span>
                /{totalAnswers} Fragen beantwortet
              </span>
              <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: totalAnswers > 0 ? `${(resolvedAnswers / totalAnswers) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {selectedTranscript.status === 'geprueft' ? (
              <Badge tone="success">Prüfung abgeschlossen</Badge>
            ) : (
              <Button
                onClick={handleComplete}
                disabled={!canComplete || completing}
                glow={canComplete}
              >
                {completing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Wird abgeschlossen...
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} />
                    Prüfung abschließen
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Overview: list transcripts + upload
  return (
    <div>
      <Link
        href={`/clients/${agencyId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-500 transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Zurück zum Kunden
      </Link>

      <PageHeader
        label="TRANSKRIPTE"
        title="Onboarding-Transkripte"
        description="Transkripte hochladen, auswerten und prüfen"
        action={
          <Button onClick={() => setShowUpload(!showUpload)} variant={showUpload ? 'ghost' : 'primary'} size="sm">
            {showUpload ? (
              <>
                <ChevronUp size={14} />
                Schließen
              </>
            ) : (
              <>
                <Upload size={14} />
                Hochladen
              </>
            )}
          </Button>
        }
      />

      {showUpload && (
        <UploadSection
          agencyId={agencyId}
          onUploaded={() => {
            setShowUpload(false);
            loadTranscripts();
          }}
        />
      )}

      <TranscriptList
        transcripts={transcripts}
        onSelect={(t) => {
          if (t.status === 'ausgewertet' || t.status === 'geprueft') {
            setSelectedTranscript(t);
          } else {
            // For non-reviewable transcripts, just show info
            alert(
              t.status === 'hochgeladen'
                ? 'Dieses Transkript wird noch verarbeitet. Bitte warte einen Moment.'
                : t.status === 'transkribiert'
                ? 'Die KI-Auswertung läuft noch. Bitte warte einen Moment.'
                : `Status: ${STATUS_LABELS[t.status] || t.status}`
            );
          }
        }}
      />

      {/* Show upload if no transcripts exist */}
      {transcripts.length === 0 && !showUpload && (
        <UploadSection
          agencyId={agencyId}
          onUploaded={() => loadTranscripts()}
        />
      )}
    </div>
  );
}
