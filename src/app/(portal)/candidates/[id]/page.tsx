'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Mail, Phone, Megaphone, Layers, StickyNote, Clock } from 'lucide-react';
import type { Candidate, CandidateStage, Note, PipelineStage, CallLog, ContentLibraryItem, CallRecording } from '@/lib/types/database';
import { CallTracker } from '@/components/call-tracker';
import { CallRecordingsPanel } from '@/components/call-recording';

type StageHistoryEntry = CandidateStage & { stage: PipelineStage; user: { name: string } | null };
type NoteWithUser = Note & { user: { name: string } };

const sourceConfig: Record<string, { label: string; tone: 'softAccent' | 'success' | 'neutral' }> = {
  meta: { label: 'Meta', tone: 'softAccent' },
  indeed: { label: 'Indeed', tone: 'success' },
  manual: { label: 'Manuell', tone: 'neutral' },
};

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [stageHistory, setStageHistory] = useState<StageHistoryEntry[]>([]);
  const [notes, setNotes] = useState<NoteWithUser[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [phoneScript, setPhoneScript] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<CallRecording[]>([]);

  useEffect(() => {
    fetch(`/api/candidates/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setCandidate(data.candidate);
        setStageHistory(data.stageHistory || []);
        setNotes(data.notes || []);
        setLoading(false);

        // Fetch call logs for this candidate
        fetch(`/api/candidates/${id}/calls`)
          .then((r) => r.json())
          .then((logs) => { if (Array.isArray(logs)) setCallLogs(logs); })
          .catch(() => {});

        // Fetch recordings
        fetch(`/api/candidates/${id}/recordings`)
          .then((r) => r.json())
          .then((recs) => { if (Array.isArray(recs)) setRecordings(recs); })
          .catch(() => {});

        // Fetch approved phone script for this agency
        if (data.candidate?.agency_id) {
          fetch(
            `/api/library?agency_id=${data.candidate.agency_id}&content_type=phone_script&status=approved_internal,approved,deployed`
          )
            .then((r) => r.json())
            .then((items: ContentLibraryItem[]) => {
              if (Array.isArray(items) && items.length > 0) {
                setPhoneScript(items[0].content);
              }
            })
            .catch(() => {});
        }
      });
  }, [id]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;

    const res = await fetch(`/api/candidates/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newNote }),
    });

    if (res.ok) {
      const note = await res.json();
      setNotes((prev) => [note, ...prev]);
      setNewNote('');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[15px] text-[var(--text-tertiary)]">Bewerber nicht gefunden.</p>
      </div>
    );
  }

  const source = sourceConfig[candidate.source] ?? { label: candidate.source, tone: 'neutral' as const };

  return (
    <div className="max-w-6xl">
      {/* Back button */}
      <button
        onClick={() => router.push('/dashboard')}
        className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-6 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Zur Pipeline
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="text-[var(--text-h2)] font-extrabold text-[var(--text-primary)] tracking-[var(--tracking-heading)] mb-1">
            {candidate.name}
          </h1>
          <p className="text-[14px] text-[var(--text-tertiary)]">
            Hinzugefügt am {new Date(candidate.created_at).toLocaleDateString('de-DE')}
          </p>
        </div>
        <Badge tone={source.tone}>{source.label}</Badge>
      </div>

      {/* Contact Info */}
      <Card padding="md" className="mb-10">
        <div className="flex items-center gap-5 mb-5">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--surface-inset)] flex items-center justify-center">
            <Mail className="w-5 h-5 text-[var(--text-secondary)]" />
          </div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Kontaktdaten</h2>
        </div>
        <div className="space-y-6 pl-12">
          {candidate.email && (
            <div className="flex items-center gap-3">
              <span className="text-[14px] text-[var(--text-tertiary)] w-20">E-Mail</span>
              <span className="text-[15px] font-medium text-[var(--text-primary)]">{candidate.email}</span>
            </div>
          )}
          {candidate.phone && (
            <div className="flex items-center gap-3">
              <span className="text-[14px] text-[var(--text-tertiary)] w-20">Telefon</span>
              <span className="text-[15px] font-medium text-[var(--text-primary)]">{candidate.phone}</span>
            </div>
          )}
          {candidate.meta_campaign && (
            <div className="flex items-center gap-3">
              <span className="text-[14px] text-[var(--text-tertiary)] w-20">Kampagne</span>
              <span className="text-[15px] font-medium text-[var(--text-primary)]">{candidate.meta_campaign}</span>
            </div>
          )}
          {candidate.meta_adset && (
            <div className="flex items-center gap-3">
              <span className="text-[14px] text-[var(--text-tertiary)] w-20">Adset</span>
              <span className="text-[15px] font-medium text-[var(--text-primary)]">{candidate.meta_adset}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Indeed Details + Resume */}
      {(candidate.resume_url || candidate.location || candidate.experience_summary || candidate.last_employer || candidate.indeed_job_title) && (
        <Card padding="md" className="mb-10">
          <div className="flex items-center gap-5 mb-5">
            <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--surface-inset)] flex items-center justify-center">
              <Layers className="w-5 h-5 text-[var(--text-secondary)]" />
            </div>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Bewerber-Details</h2>
          </div>
          <div className="space-y-6 pl-12">
            {candidate.indeed_job_title && (
              <div className="flex items-center gap-2">
                <Badge tone="softAccent">Indeed</Badge>
                <span className="text-sm text-gray-700">{candidate.indeed_job_title}</span>
              </div>
            )}
            {candidate.location && (
              <p className="text-sm text-gray-600"><span className="font-medium">Wohnort:</span> {candidate.location}</p>
            )}
            {candidate.last_employer && (
              <p className="text-sm text-gray-600"><span className="font-medium">Letzter AG:</span> {candidate.last_employer}</p>
            )}
            {candidate.experience_summary && (
              <p className="text-sm text-gray-600"><span className="font-medium">Erfahrung:</span> {candidate.experience_summary}</p>
            )}
            {candidate.resume_url && (
              <a
                href={candidate.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-2 px-4 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition"
              >
                Lebenslauf anzeigen (PDF)
              </a>
            )}
          </div>
        </Card>
      )}

      {/* Stage Timeline */}
      <Card padding="md" className="mb-10">
        <div className="flex items-center gap-5 mb-5">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--surface-inset)] flex items-center justify-center">
            <Clock className="w-5 h-5 text-[var(--text-secondary)]" />
          </div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Phasen-Verlauf</h2>
        </div>
        <div className="pl-12 space-y-0">
          {stageHistory.map((entry, i) => (
            <div key={entry.id} className="relative flex items-start gap-3 pb-4 last:pb-0">
              {/* Connector line */}
              {i < stageHistory.length - 1 && (
                <div className="absolute left-[5px] top-[14px] w-px h-[calc(100%-6px)] bg-[var(--border-default)]" />
              )}
              {/* Dot */}
              <div
                className="w-[11px] h-[11px] rounded-full flex-shrink-0 mt-[3px] ring-2 ring-white"
                style={{ backgroundColor: entry.stage.color }}
              />
              <div className="flex-1 min-w-0">
                <span className="text-[15px] font-medium text-[var(--text-primary)]">{entry.stage.name}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[14px] text-[var(--text-tertiary)]">
                    {new Date(entry.changed_at).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {entry.user && (
                    <span className="text-[14px] text-[var(--text-tertiary)]">
                      von {entry.user.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {stageHistory.length === 0 && (
            <p className="text-[14px] text-[var(--text-tertiary)]">Kein Verlauf vorhanden.</p>
          )}
        </div>
      </Card>

      {/* Notes */}
      <Card padding="md" className="mb-10">
        <div className="flex items-center gap-5 mb-5">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--surface-inset)] flex items-center justify-center">
            <StickyNote className="w-5 h-5 text-[var(--text-secondary)]" />
          </div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Notizen</h2>
        </div>

        <form onSubmit={addNote} className="flex gap-2 mb-8 pl-12">
          <Input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Notiz hinzufügen..."
            className="flex-1"
          />
          <Button type="submit" variant="primary" size="md">
            Speichern
          </Button>
        </form>

        <div className="space-y-6 pl-12">
          {notes.map((note) => (
            <div key={note.id}>
              <p className="text-[15px] text-[var(--text-primary)]">{note.text}</p>
              <p className="text-[14px] text-[var(--text-tertiary)] mt-1">
                {note.user.name} &middot;{' '}
                {new Date(note.created_at).toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          ))}
          {notes.length === 0 && (
            <p className="text-[14px] text-[var(--text-tertiary)]">Noch keine Notizen.</p>
          )}
        </div>
      </Card>

      {/* Call Tracker */}
      <div className="mb-8">
        <div className="flex items-center gap-5 mb-5">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--surface-inset)] flex items-center justify-center">
            <Phone className="w-5 h-5 text-[var(--text-secondary)]" />
          </div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Anrufe</h2>
        </div>
        <CallTracker
          candidateId={id}
          candidatePhone={candidate.phone}
          callLogs={callLogs}
          script={phoneScript}
          onLogCreated={(log) => setCallLogs((prev) => [log, ...prev])}
        />
      </div>

      {/* Call Recordings */}
      <div className="mt-12">
        <CallRecordingsPanel
          candidateId={id}
          recordings={recordings}
          onRecordingAdded={(rec) => setRecordings((prev) => [rec, ...prev])}
        />
      </div>
    </div>
  );
}
