'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Mail, Phone, Megaphone, Layers, StickyNote, Clock, CalendarCheck, History } from 'lucide-react';
import type { Candidate, CandidateStage, Note, PipelineStage, CallLog, ContentLibraryItem, CallRecording, CalendlyEvent, ActivityLogEntry } from '@/lib/types/database';
import { CallTracker } from '@/components/call-tracker';
import { CallRecordingsPanel } from '@/components/call-recording';
import { ActivityFeed } from '@/components/activity-feed';
import { CandidateInfoCards } from '@/components/candidates/candidate-info-cards';

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
  const [calendlyEvents, setCalendlyEvents] = useState<CalendlyEvent[]>([]);
  const [timeline, setTimeline] = useState<ActivityLogEntry[]>([]);

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

        // Fetch Calendly events for this candidate
        fetch(`/api/calendly/events?candidate_id=${id}`)
          .then((r) => r.json())
          .then((events) => { if (Array.isArray(events)) setCalendlyEvents(events); })
          .catch(() => {});

        // Fetch activity timeline
        fetch(`/api/activity?candidate_id=${id}&limit=100`)
          .then((r) => r.json())
          .then((entries) => { if (Array.isArray(entries)) setTimeline(entries); })
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
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Bewerber nicht gefunden.</p>
      </div>
    );
  }

  const source = sourceConfig[candidate.source] ?? { label: candidate.source, tone: 'neutral' as const };

  return (
    <div className="max-w-6xl">
      {/* Back button */}
      <button
        onClick={() => router.push('/dashboard')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors mb-6 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Zur Pipeline
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight mb-1">
            {candidate.name}
          </h1>
          <p className="text-sm text-gray-400">
            Hinzugefügt am {new Date(candidate.created_at).toLocaleDateString('de-DE')}
          </p>
        </div>
        <Badge tone={source.tone}>{source.label}</Badge>
      </div>

      {/* Status Cards (Consent, No-Show, Kadenz, TTFC) */}
      <CandidateInfoCards candidateId={id} />

      {/* Contact Info */}
      <Card padding="md" className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            <Mail className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Kontaktdaten</h2>
        </div>
        <div className="space-y-6 pl-12">
          {candidate.email && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 w-20">E-Mail</span>
              <span className="text-sm font-medium text-gray-900">{candidate.email}</span>
            </div>
          )}
          {candidate.phone && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 w-20">Telefon</span>
              <span className="text-sm font-medium text-gray-900">{candidate.phone}</span>
            </div>
          )}
          {candidate.meta_campaign && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 w-20">Kampagne</span>
              <span className="text-sm font-medium text-gray-900">{candidate.meta_campaign}</span>
            </div>
          )}
          {candidate.meta_adset && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 w-20">Adset</span>
              <span className="text-sm font-medium text-gray-900">{candidate.meta_adset}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Indeed Details + Resume */}
      {(candidate.resume_url || candidate.location || candidate.experience_summary || candidate.last_employer || candidate.indeed_job_title) && (
        <Card padding="md" className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
              <Layers className="w-5 h-5 text-gray-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Bewerber-Details</h2>
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
                className="inline-flex items-center gap-2 mt-2 px-4 py-2 rounded-lg bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 transition"
              >
                Lebenslauf anzeigen (PDF)
              </a>
            )}
          </div>
        </Card>
      )}

      {/* Stage Timeline */}
      <Card padding="md" className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            <Clock className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Phasen-Verlauf</h2>
        </div>
        <div className="pl-12 space-y-0">
          {stageHistory.map((entry, i) => (
            <div key={entry.id} className="relative flex items-start gap-3 pb-4 last:pb-0">
              {/* Connector line */}
              {i < stageHistory.length - 1 && (
                <div className="absolute left-[5px] top-[14px] w-px h-[calc(100%-6px)] bg-gray-200" />
              )}
              {/* Dot */}
              <div
                className="w-[11px] h-[11px] rounded-full flex-shrink-0 mt-[3px] ring-2 ring-white"
                style={{ backgroundColor: entry.stage.color }}
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900">{entry.stage.name}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm text-gray-400">
                    {new Date(entry.changed_at).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {entry.user && (
                    <span className="text-sm text-gray-400">
                      von {entry.user.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {stageHistory.length === 0 && (
            <p className="text-sm text-gray-400">Kein Verlauf vorhanden.</p>
          )}
        </div>
      </Card>

      {/* Notes */}
      <Card padding="md" className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            <StickyNote className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Notizen</h2>
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
              <p className="text-sm text-gray-900">{note.text}</p>
              <p className="text-sm text-gray-400 mt-1">
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
            <p className="text-sm text-gray-400">Noch keine Notizen.</p>
          )}
        </div>
      </Card>

      {/* Termine (Calendly) */}
      {calendlyEvents.length > 0 && (
        <Card padding="md" className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-gray-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Termine</h2>
            <Badge tone="neutral">{calendlyEvents.length}</Badge>
          </div>
          <div className="space-y-3 pl-12">
            {calendlyEvents.map((evt) => {
              const statusBadge: Record<string, { label: string; tone: 'success' | 'neutral' | 'accent' | 'softAccent' }> = {
                scheduled: { label: 'Geplant', tone: 'softAccent' },
                completed: { label: 'Abgeschlossen', tone: 'success' },
                cancelled: { label: 'Abgesagt', tone: 'accent' },
                no_show: { label: 'No-Show', tone: 'accent' },
              };
              const badge = statusBadge[evt.status] || statusBadge.scheduled;
              const startDate = new Date(evt.start_time);
              const endDate = evt.end_time ? new Date(evt.end_time) : null;

              return (
                <div key={evt.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {evt.event_name || evt.event_type || 'Termin'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {startDate.toLocaleDateString('de-DE', {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}{' '}
                      {startDate.toLocaleTimeString('de-DE', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {endDate && (
                        <>
                          {' '}&ndash;{' '}
                          {endDate.toLocaleTimeString('de-DE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </>
                      )}
                    </p>
                    {evt.location && (
                      <p className="text-xs text-gray-400 mt-0.5">{evt.location}</p>
                    )}
                  </div>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Call Tracker */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            <Phone className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Anrufe</h2>
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
      <div className="mt-8">
        <CallRecordingsPanel
          candidateId={id}
          recordings={recordings}
          onRecordingAdded={(rec) => setRecordings((prev) => [rec, ...prev])}
        />
      </div>

      {/* Chronik / Activity Timeline */}
      <Card padding="md" className="mt-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            <History className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Chronik</h2>
          {timeline.length > 0 && (
            <Badge tone="neutral">{timeline.length}</Badge>
          )}
        </div>
        <div className="pl-12">
          <ActivityFeed
            entries={timeline}
            emptyText="Noch keine Aktivitäten für diesen Bewerber."
          />
        </div>
      </Card>
    </div>
  );
}
