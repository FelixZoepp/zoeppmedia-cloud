'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  ArrowLeft,
  Mail,
  Phone,
  MessageCircle,
  MapPin,
  Megaphone,
  Clock,
  User,
  FileText,
  Briefcase,
  Download,
  Shield,
  ShieldX,
  AlertTriangle,
  Check,
  X,
  Ban,
  Zap,
  PhoneCall,
  CircleDot,
  ChevronDown,
  CalendarCheck,
  StickyNote,
  History,
  Mic,
  Upload,
  FileAudio,
  CheckCircle,
  AlertCircle,
  ChevronUp,
  Star,
  ExternalLink,
} from 'lucide-react';
import type {
  PipelineStage,
  CallLog,
  CallResult,
  CallNextStep,
  CallRecording,
  CallRecordingAnalysis,
  CalendlyEvent,
  ActivityLogEntry,
  ActivityActionType,
} from '@/lib/types/database';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

// Extended candidate with DB fields not yet in the TS type
type CandidateDetail = {
  id: string;
  agency_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: 'meta' | 'indeed' | 'manual';
  meta_campaign: string | null;
  meta_adset: string | null;
  meta_form: string | null;
  current_stage_id: string;
  created_at: string;
  resume_url: string | null;
  location: string | null;
  experience_summary: string | null;
  last_employer: string | null;
  indeed_job_title: string | null;
  // Extended fields from DB
  whatsapp_opt_in?: boolean;
  email_opt_in?: boolean;
  sms_opt_in?: boolean;
  recording_consent?: boolean;
  do_not_contact?: boolean;
  first_dial_at?: string | null;
  first_contact_at?: string | null;
  ttfc_seconds?: number | null;
  noshow_points?: number;
  blacklisted?: boolean;
  blacklist_reason?: string | null;
  cadence_active?: boolean;
  cadence_attempt?: number | null;
  preferred_call_window?: string | null;
  recruiting_stage_key?: string | null;
  recruiting_status?: string | null;
  vorquali_json?: Record<string, unknown> | null;
};

type StageHistoryEntry = {
  id: string;
  candidate_id: string;
  stage_id: string;
  changed_by: string | null;
  changed_at: string;
  stage: PipelineStage;
  user: { name: string } | null;
};

type NoteWithUser = {
  id: string;
  candidate_id: string;
  user_id: string;
  text: string;
  created_at: string;
  user: { name: string };
};

type DetailResponse = {
  candidate: CandidateDetail;
  stageHistory: StageHistoryEntry[];
  notes: NoteWithUser[];
  stages: PipelineStage[];
  callLogs: CallLog[];
  recordings: CallRecording[];
  calendlyEvents: CalendlyEvent[];
  timeline: (ActivityLogEntry & { user?: { name: string } | null })[];
  currentStage: PipelineStage | null;
};

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'vor 1 Tag';
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 30) return `vor ${Math.floor(days / 7)} Woche${Math.floor(days / 7) === 1 ? '' : 'n'}`;
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ttfcTrafficLight(ms: number): {
  label: string;
  dotColor: string;
  textColor: string;
} {
  const minutes = ms / 60_000;
  if (minutes <= 15)
    return {
      label: 'Sehr schnell',
      dotColor: 'bg-green-500',
      textColor: 'text-green-600',
    };
  if (minutes <= 240)
    return {
      label: 'Akzeptabel',
      dotColor: 'bg-amber-500',
      textColor: 'text-amber-600',
    };
  return {
    label: 'Zu langsam',
    dotColor: 'bg-red-500',
    textColor: 'text-red-600',
  };
}

const sourceConfig: Record<
  string,
  { label: string; tone: 'softAccent' | 'success' | 'neutral' }
> = {
  meta: { label: 'Meta', tone: 'softAccent' },
  indeed: { label: 'Indeed', tone: 'success' },
  manual: { label: 'Manuell', tone: 'neutral' },
};

const WINDOW_LABELS: Record<string, string> = {
  morning: 'Morgens (08-12)',
  afternoon: 'Nachmittags (12-17)',
  evening: 'Abends (17-20)',
};

const resultBadge: Record<
  CallResult,
  { label: string; tone: 'success' | 'neutral' | 'outline' | 'softAccent' | 'accent' }
> = {
  termin_vereinbart: { label: 'Termin', tone: 'success' },
  kein_interesse: { label: 'Kein Interesse', tone: 'neutral' },
  nicht_erreicht: { label: 'Nicht erreicht', tone: 'outline' },
  falsche_nummer: { label: 'Falsche Nr.', tone: 'accent' },
  rueckruf: { label: 'Rückruf', tone: 'softAccent' },
  sonstiges: { label: 'Sonstiges', tone: 'neutral' },
};

const resultOptions: { value: CallResult; label: string }[] = [
  { value: 'termin_vereinbart', label: 'Termin vereinbart' },
  { value: 'kein_interesse', label: 'Kein Interesse' },
  { value: 'nicht_erreicht', label: 'Mailbox / Nicht erreicht' },
  { value: 'falsche_nummer', label: 'Falsche Nummer' },
  { value: 'rueckruf', label: 'Rückruf gewünscht' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

const nextStepOptions: { value: CallNextStep; label: string }[] = [
  { value: 'erneut_anrufen', label: 'Erneut anrufen' },
  { value: 'termin_bestaetigen', label: 'Termin bestätigen' },
  { value: 'absage', label: 'Absage' },
  { value: 'warten', label: 'Warten' },
];

const activityIconMap: Record<ActivityActionType, React.ReactNode> = {
  login: <User className="w-3.5 h-3.5" />,
  call: <Phone className="w-3.5 h-3.5" />,
  stage_change: <ChevronDown className="w-3.5 h-3.5" />,
  note: <StickyNote className="w-3.5 h-3.5" />,
  content_approval: <CheckCircle className="w-3.5 h-3.5" />,
  content_rejection: <X className="w-3.5 h-3.5" />,
  recording_upload: <Mic className="w-3.5 h-3.5" />,
  onboarding_complete: <CheckCircle className="w-3.5 h-3.5" />,
  survey_submitted: <FileText className="w-3.5 h-3.5" />,
  funnel_published: <Megaphone className="w-3.5 h-3.5" />,
  candidate_created: <User className="w-3.5 h-3.5" />,
  invite_sent: <Mail className="w-3.5 h-3.5" />,
  email_sent: <Mail className="w-3.5 h-3.5" />,
  task_completed: <CheckCircle className="w-3.5 h-3.5" />,
  other: <CircleDot className="w-3.5 h-3.5" />,
};

const activityColorMap: Record<ActivityActionType, string> = {
  login: 'bg-blue-50 text-blue-600',
  call: 'bg-red-50 text-red-600',
  stage_change: 'bg-purple-50 text-purple-600',
  note: 'bg-yellow-50 text-yellow-600',
  content_approval: 'bg-green-50 text-green-600',
  content_rejection: 'bg-red-50 text-red-600',
  recording_upload: 'bg-indigo-50 text-indigo-600',
  onboarding_complete: 'bg-green-50 text-green-700',
  survey_submitted: 'bg-gray-100 text-gray-600',
  funnel_published: 'bg-orange-50 text-orange-600',
  candidate_created: 'bg-teal-50 text-teal-600',
  invite_sent: 'bg-blue-50 text-blue-600',
  email_sent: 'bg-blue-50 text-blue-600',
  task_completed: 'bg-green-50 text-green-600',
  other: 'bg-gray-100 text-gray-500',
};

const recruitingStatusLabels: Record<string, { label: string; tone: 'success' | 'neutral' | 'accent' | 'softAccent' }> = {
  aktiv: { label: 'Aktiv', tone: 'success' },
  eingestellt: { label: 'Eingestellt', tone: 'success' },
  abgelehnt: { label: 'Abgelehnt', tone: 'accent' },
  abgesprungen: { label: 'Abgesprungen', tone: 'accent' },
};

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

function SectionHeader({
  icon,
  title,
  badge,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {badge}
      </div>
      {action}
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right ml-4">
        {children}
      </span>
    </div>
  );
}

function ConsentRow({
  label,
  active,
  unknown,
}: {
  label: string;
  active: boolean | undefined;
  unknown?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-600">{label}</span>
      {unknown ? (
        <span className="text-xs text-gray-400">Unbekannt</span>
      ) : active ? (
        <div className="flex items-center gap-1.5">
          <Check className="w-4 h-4 text-green-500" />
          <span className="text-xs text-green-600">Ja</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <X className="w-4 h-4 text-red-500" />
          <span className="text-xs text-red-600">Nein</span>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Main Page Component                                                */
/* ================================================================== */

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [stageChanging, setStageChanging] = useState(false);

  // Call log form state
  const [callResult, setCallResult] = useState<CallResult | ''>('');
  const [callNotes, setCallNotes] = useState('');
  const [callNextStep, setCallNextStep] = useState('');
  const [callNextDate, setCallNextDate] = useState('');
  const [savingCall, setSavingCall] = useState(false);

  // Recording upload state
  const [uploading, setUploading] = useState(false);
  const [recordingType, setRecordingType] = useState('erstgespraech');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [expandedRecording, setExpandedRecording] = useState<string | null>(
    null
  );

  // Stage dropdown
  const [showStageDropdown, setShowStageDropdown] = useState(false);

  const fetchData = useCallback(() => {
    fetch(`/api/candidates/${id}/detail`)
      .then((r) => r.json())
      .then((d: DetailResponse) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ------ Actions ------ */

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/candidates/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newNote }),
      });
      if (res.ok) {
        const note = await res.json();
        setData((prev) =>
          prev ? { ...prev, notes: [note, ...prev.notes] } : prev
        );
        setNewNote('');
      }
    } finally {
      setSavingNote(false);
    }
  }

  async function changeStage(stageId: string) {
    setStageChanging(true);
    try {
      const res = await fetch(`/api/candidates/${id}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId }),
      });
      if (res.ok) {
        fetchData();
      }
    } finally {
      setStageChanging(false);
      setShowStageDropdown(false);
    }
  }

  async function logCall(e: React.FormEvent) {
    e.preventDefault();
    if (!callResult) return;
    setSavingCall(true);
    try {
      const res = await fetch(`/api/candidates/${id}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: callResult,
          notes: callNotes || null,
          next_step: callNextStep || null,
          next_contact_date: callNextDate || null,
        }),
      });
      if (res.ok) {
        const log: CallLog = await res.json();
        setData((prev) =>
          prev ? { ...prev, callLogs: [log, ...prev.callLogs] } : prev
        );
        setCallResult('');
        setCallNotes('');
        setCallNextStep('');
        setCallNextDate('');
      }
    } finally {
      setSavingCall(false);
    }
  }

  async function handleRecordingUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setUploadError('Datei zu gross (max 100MB)');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('recording_type', recordingType);
      const res = await fetch(`/api/candidates/${id}/recordings`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const recording = await res.json();
        setData((prev) =>
          prev
            ? { ...prev, recordings: [recording, ...prev.recordings] }
            : prev
        );
      } else {
        const err = await res.json();
        setUploadError(err.error || 'Upload fehlgeschlagen');
      }
    } catch {
      setUploadError('Upload fehlgeschlagen');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  /* ------ Loading / Not Found ------ */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || !data.candidate) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Bewerber nicht gefunden.</p>
      </div>
    );
  }

  const { candidate, stageHistory, notes, stages, callLogs, recordings, calendlyEvents, timeline, currentStage } = data;
  const source = sourceConfig[candidate.source] ?? {
    label: candidate.source,
    tone: 'neutral' as const,
  };

  // Speed-to-Lead calculations
  const createdMs = new Date(candidate.created_at).getTime();
  const firstDialMs = candidate.first_dial_at
    ? new Date(candidate.first_dial_at).getTime()
    : null;
  const firstContactMs = candidate.first_contact_at
    ? new Date(candidate.first_contact_at).getTime()
    : null;
  const ttfd = firstDialMs ? firstDialMs - createdMs : null;
  const ttfc = firstContactMs ? firstContactMs - createdMs : null;

  // No-show
  const noshowPoints = Number(candidate.noshow_points) || 0;
  const noshowColor =
    noshowPoints === 0
      ? 'text-green-600'
      : noshowPoints < 2
        ? 'text-amber-500'
        : 'text-red-600';

  // Time in current stage
  const latestStageEntry = stageHistory.find(
    (e) => e.stage_id === candidate.current_stage_id
  );
  const timeInStage = latestStageEntry
    ? Date.now() - new Date(latestStageEntry.changed_at).getTime()
    : null;

  // Vorquali
  const vorquali = candidate.vorquali_json;
  const hasVorquali =
    vorquali && typeof vorquali === 'object' && Object.keys(vorquali).length > 0;

  // Recruiting status
  const recStatus = candidate.recruiting_status
    ? recruitingStatusLabels[candidate.recruiting_status] || {
        label: candidate.recruiting_status,
        tone: 'neutral' as const,
      }
    : null;

  return (
    <div className="max-w-[1400px]">
      {/* Back button */}
      <button
        onClick={() => router.push('/dashboard')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors mb-6 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Zur Pipeline
      </button>

      {/* ============================================================ */}
      {/*  HEADER                                                       */}
      {/* ============================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0">
            <User className="w-7 h-7 text-gray-400" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                {candidate.name}
              </h1>
              <Badge tone={source.tone}>{source.label}</Badge>
              {currentStage && (
                <span
                  className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full text-white"
                  style={{ backgroundColor: currentStage.color }}
                >
                  {currentStage.name}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400 mt-1">
              Hinzugefuegt {timeAgo(candidate.created_at)}
              {candidate.location && (
                <>
                  {' '}
                  <span className="text-gray-300">|</span>{' '}
                  <MapPin className="w-3 h-3 inline-block -mt-0.5" />{' '}
                  {candidate.location}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {candidate.phone && (
            <a
              href={`tel:${candidate.phone}`}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              Anrufen
            </a>
          )}
          {candidate.phone && (
            <a
              href={`https://wa.me/${candidate.phone.replace(/[^0-9+]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp
            </a>
          )}
          {candidate.email && (
            <a
              href={`mailto:${candidate.email}`}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              E-Mail
            </a>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/*  3-COLUMN LAYOUT                                              */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ========================================================== */}
        {/*  LEFT COLUMN (Main Content - 3/5)                           */}
        {/* ========================================================== */}
        <div className="lg:col-span-3 space-y-6">
          {/* ---- Kontaktdaten Card ---- */}
          <Card padding="md">
            <SectionHeader
              icon={<Mail className="w-4 h-4 text-gray-600" />}
              title="Kontaktdaten"
            />
            <div className="space-y-1 divide-y divide-gray-100">
              <InfoRow label="Name">
                <span className="font-semibold">{candidate.name}</span>
              </InfoRow>
              {candidate.email && (
                <InfoRow label="E-Mail">
                  <a
                    href={`mailto:${candidate.email}`}
                    className="text-blue-600 hover:text-blue-700 underline decoration-blue-200"
                  >
                    {candidate.email}
                  </a>
                </InfoRow>
              )}
              {candidate.phone && (
                <InfoRow label="Telefon">
                  <a
                    href={`tel:${candidate.phone}`}
                    className="text-blue-600 hover:text-blue-700 underline decoration-blue-200"
                  >
                    {candidate.phone}
                  </a>
                </InfoRow>
              )}
              {candidate.location && (
                <InfoRow label="Standort">{candidate.location}</InfoRow>
              )}
              {candidate.source === 'meta' && (
                <>
                  <InfoRow label="Quelle">
                    <div className="flex items-center gap-2">
                      <Badge tone="softAccent">Meta</Badge>
                    </div>
                  </InfoRow>
                  {candidate.meta_campaign && (
                    <InfoRow label="Kampagne">
                      {candidate.meta_campaign}
                    </InfoRow>
                  )}
                  {candidate.meta_adset && (
                    <InfoRow label="Adset">{candidate.meta_adset}</InfoRow>
                  )}
                </>
              )}
              {candidate.source === 'indeed' &&
                candidate.indeed_job_title && (
                  <InfoRow label="Indeed Jobtitel">
                    {candidate.indeed_job_title}
                  </InfoRow>
                )}
            </div>
          </Card>

          {/* ---- Aktivitaets-Timeline Card ---- */}
          <Card padding="md">
            <SectionHeader
              icon={<History className="w-4 h-4 text-gray-600" />}
              title="Aktivitaeten"
              badge={
                timeline.length > 0 ? (
                  <Badge tone="neutral">{timeline.length}</Badge>
                ) : undefined
              }
            />

            {/* Note input at top */}
            <form onSubmit={addNote} className="flex gap-2 mb-6">
              <Input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Notiz hinzufuegen..."
                className="flex-1"
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={savingNote || !newNote.trim()}
              >
                {savingNote ? '...' : 'Speichern'}
              </Button>
            </form>

            {/* Combined Timeline */}
            <div className="space-y-0">
              {/* Notes as timeline entries */}
              {notes.length === 0 && stageHistory.length === 0 && timeline.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">
                  Noch keine Aktivitaeten vorhanden.
                </p>
              )}

              {/* Stage changes */}
              {stageHistory.map((entry, i) => (
                <div
                  key={`stage-${entry.id}`}
                  className="relative flex items-start gap-3 py-3"
                >
                  {i < stageHistory.length - 1 && (
                    <div className="absolute left-[15px] top-[30px] w-px h-[calc(100%-12px)] bg-gray-100" />
                  )}
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <ChevronDown className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">Phase gewechselt:</span>{' '}
                      <span
                        className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full text-white"
                        style={{
                          backgroundColor: entry.stage.color,
                        }}
                      >
                        {entry.stage.name}
                      </span>
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400">
                        {timeAgo(entry.changed_at)}
                      </span>
                      {entry.user && (
                        <span className="text-xs text-gray-400">
                          von {entry.user.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Activity timeline entries */}
              {timeline.map((entry) => {
                const icon =
                  activityIconMap[entry.action_type] ?? activityIconMap.other;
                const color =
                  activityColorMap[entry.action_type] ?? activityColorMap.other;
                return (
                  <div
                    key={`activity-${entry.id}`}
                    className="flex items-start gap-3 py-3"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}
                    >
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-sm text-gray-900">{entry.action}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">
                          {timeAgo(entry.created_at)}
                        </span>
                        {entry.user?.name && (
                          <span className="text-xs text-gray-400">
                            von {entry.user.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* ---- Anrufe & Recordings Card ---- */}
          <Card padding="md">
            <SectionHeader
              icon={<Phone className="w-4 h-4 text-gray-600" />}
              title="Anrufe & Aufnahmen"
              badge={
                callLogs.length > 0 ? (
                  <Badge tone="neutral">{callLogs.length}</Badge>
                ) : undefined
              }
            />

            {/* Quick call log form */}
            <form
              onSubmit={logCall}
              className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100"
            >
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                Anruf protokollieren
              </p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {resultOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center justify-center p-2 rounded-lg border text-xs cursor-pointer transition-colors text-center ${
                      callResult === opt.value
                        ? 'border-red-200 bg-red-50 text-red-700 font-medium'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="callResult"
                      value={opt.value}
                      checked={callResult === opt.value}
                      onChange={() => setCallResult(opt.value)}
                      className="sr-only"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              <textarea
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="Notiz zum Anruf..."
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none resize-none bg-white mb-3"
              />
              <div className="flex gap-3">
                <Select
                  options={[
                    { value: '', label: 'Naechster Schritt...' },
                    ...nextStepOptions,
                  ]}
                  value={callNextStep}
                  onChange={(e) => setCallNextStep(e.target.value)}
                  className="flex-1"
                />
                <input
                  type="date"
                  value={callNextDate}
                  onChange={(e) => setCallNextDate(e.target.value)}
                  className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-white"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={!callResult || savingCall}
                >
                  {savingCall ? '...' : 'Speichern'}
                </Button>
              </div>
            </form>

            {/* Call History */}
            {callLogs.length > 0 && (
              <div className="space-y-3 mb-6">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Verlauf
                </p>
                {callLogs.map((log) => {
                  const badge = resultBadge[log.result];
                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Phone className="w-3.5 h-3.5 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge tone={badge?.tone ?? 'neutral'}>
                            {badge?.label ?? log.result}
                          </Badge>
                          <span className="text-xs text-gray-400">
                            {formatDateTime(log.created_at)}
                          </span>
                        </div>
                        {log.notes && (
                          <p className="text-sm text-gray-700 mt-1">
                            {log.notes}
                          </p>
                        )}
                        {log.next_step && (
                          <p className="text-xs text-gray-400 mt-1">
                            Naechster Schritt:{' '}
                            {nextStepOptions.find(
                              (o) => o.value === log.next_step
                            )?.label ?? log.next_step}
                            {log.next_contact_date && (
                              <>
                                {' '}
                                &middot;{' '}
                                {new Date(
                                  log.next_contact_date
                                ).toLocaleDateString('de-DE')}
                              </>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Recording Upload */}
            <div className="border-t border-gray-100 pt-5">
              <div className="flex items-center gap-3 mb-4">
                <Mic className="w-4 h-4 text-gray-600" />
                <p className="text-sm font-semibold text-gray-900">
                  Gespraechsaufnahmen
                </p>
                {recordings.length > 0 && (
                  <Badge tone="neutral">{recordings.length}</Badge>
                )}
              </div>

              <div className="flex items-center gap-3 mb-4">
                <select
                  value={recordingType}
                  onChange={(e) => setRecordingType(e.target.value)}
                  className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none bg-white"
                >
                  <option value="erstgespraech">Erstgespraech</option>
                  <option value="vorstellungsgespraech">
                    Vorstellungsgespraech
                  </option>
                  <option value="follow_up">Follow-Up</option>
                  <option value="sonstiges">Sonstiges</option>
                </select>
                <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-red-200 hover:text-red-600 transition cursor-pointer">
                  {uploading ? (
                    <span className="animate-pulse">
                      Wird hochgeladen...
                    </span>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Audio/Video hochladen
                    </>
                  )}
                  <input
                    type="file"
                    accept="audio/*,video/*,.mp3,.mp4,.m4a,.wav,.webm,.ogg,.flac"
                    onChange={handleRecordingUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>

              {uploadError && (
                <p className="text-sm text-red-600 mb-3">{uploadError}</p>
              )}

              {/* Recordings List */}
              {recordings.map((rec) => {
                const isExpanded = expandedRecording === rec.id;
                const typeLabels: Record<string, string> = {
                  erstgespraech: 'Erstgespraech',
                  vorstellungsgespraech: 'Vorstellungsgespraech',
                  follow_up: 'Follow-Up',
                  sonstiges: 'Sonstiges',
                };

                return (
                  <div
                    key={rec.id}
                    className="border border-gray-100 rounded-xl overflow-hidden mb-2 bg-white"
                  >
                    <button
                      onClick={() =>
                        setExpandedRecording(isExpanded ? null : rec.id)
                      }
                      className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                          <FileAudio className="w-4 h-4 text-red-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {rec.file_name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge tone="softAccent">
                              {typeLabels[rec.recording_type] ||
                                rec.recording_type}
                            </Badge>
                            <span className="text-xs text-gray-400">
                              {timeAgo(rec.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {rec.analysis &&
                          rec.analysis_status === 'done' && (
                            <span className="text-sm font-semibold text-gray-900">
                              {
                                (rec.analysis as CallRecordingAnalysis)
                                  .overall_score
                              }
                              /100
                            </span>
                          )}
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-gray-50">
                        {rec.transcript && (
                          <div className="mt-4">
                            <p className="text-xs font-medium text-gray-500 mb-2">
                              Transkript
                            </p>
                            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-900 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                              {rec.transcript}
                            </div>
                          </div>
                        )}

                        {rec.transcript_status === 'processing' && (
                          <p className="mt-3 text-sm text-amber-600 animate-pulse">
                            Transkript wird erstellt...
                          </p>
                        )}

                        {rec.analysis &&
                          rec.analysis_status === 'done' && (
                            <div className="mt-4 space-y-3">
                              {/* Score bars */}
                              {[
                                {
                                  label: 'Skript-Treue',
                                  score: (
                                    rec.analysis as CallRecordingAnalysis
                                  ).script_adherence_score,
                                },
                                {
                                  label: 'Gespraechsqualitaet',
                                  score: (
                                    rec.analysis as CallRecordingAnalysis
                                  ).conversation_quality_score,
                                },
                                {
                                  label: 'Gesamt',
                                  score: (
                                    rec.analysis as CallRecordingAnalysis
                                  ).overall_score,
                                },
                              ].map((item) => (
                                <div key={item.label}>
                                  <div className="flex justify-between text-sm mb-1">
                                    <span className="text-gray-600">
                                      {item.label}
                                    </span>
                                    <span className="font-semibold text-gray-900">
                                      {item.score}/100
                                    </span>
                                  </div>
                                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        item.score >= 70
                                          ? 'bg-green-500'
                                          : item.score >= 40
                                            ? 'bg-amber-500'
                                            : 'bg-red-600'
                                      }`}
                                      style={{
                                        width: `${item.score}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}

                              <p className="text-sm text-gray-700 leading-relaxed">
                                {
                                  (rec.analysis as CallRecordingAnalysis)
                                    .summary
                                }
                              </p>

                              {(rec.analysis as CallRecordingAnalysis)
                                .strengths.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-green-700 mb-1">
                                    Staerken
                                  </p>
                                  <ul className="space-y-1">
                                    {(
                                      rec.analysis as CallRecordingAnalysis
                                    ).strengths.map((s, i) => (
                                      <li
                                        key={i}
                                        className="flex items-start gap-2 text-sm text-gray-700"
                                      >
                                        <Star className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
                                        {s}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {(rec.analysis as CallRecordingAnalysis)
                                .improvements.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-amber-700 mb-1">
                                    Verbesserungen
                                  </p>
                                  <ul className="space-y-1">
                                    {(
                                      rec.analysis as CallRecordingAnalysis
                                    ).improvements.map((s, i) => (
                                      <li
                                        key={i}
                                        className="flex items-start gap-2 text-sm text-gray-700"
                                      >
                                        <AlertCircle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                                        {s}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                        {rec.analysis_status === 'processing' && (
                          <p className="mt-3 text-sm text-amber-600 animate-pulse">
                            KI-Analyse laeuft...
                          </p>
                        )}

                        {rec.file_url && (
                          <div className="mt-4">
                            <audio
                              controls
                              className="w-full"
                              src={rec.file_url}
                            >
                              Dein Browser unterstuetzt kein Audio.
                            </audio>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {recordings.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-3">
                  Noch keine Aufnahmen
                </p>
              )}
            </div>
          </Card>

          {/* ---- Termine Card ---- */}
          {calendlyEvents.length > 0 && (
            <Card padding="md">
              <SectionHeader
                icon={<CalendarCheck className="w-4 h-4 text-gray-600" />}
                title="Termine"
                badge={<Badge tone="neutral">{calendlyEvents.length}</Badge>}
              />
              <div className="space-y-2">
                {calendlyEvents.map((evt) => {
                  const statusBadge: Record<
                    string,
                    {
                      label: string;
                      tone:
                        | 'success'
                        | 'neutral'
                        | 'accent'
                        | 'softAccent';
                    }
                  > = {
                    scheduled: { label: 'Geplant', tone: 'softAccent' },
                    completed: {
                      label: 'Abgeschlossen',
                      tone: 'success',
                    },
                    cancelled: { label: 'Abgesagt', tone: 'accent' },
                    no_show: { label: 'No-Show', tone: 'accent' },
                  };
                  const sb =
                    statusBadge[evt.status] || statusBadge.scheduled;
                  const startDate = new Date(evt.start_time);
                  const endDate = evt.end_time
                    ? new Date(evt.end_time)
                    : null;

                  return (
                    <div
                      key={evt.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <CalendarCheck className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {evt.event_name ||
                            evt.event_type ||
                            'Termin'}
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
                              {' '}
                              &ndash;{' '}
                              {endDate.toLocaleTimeString('de-DE', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </>
                          )}
                        </p>
                      </div>
                      <Badge tone={sb.tone}>{sb.label}</Badge>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* ========================================================== */}
        {/*  RIGHT SIDEBAR (2/5)                                        */}
        {/* ========================================================== */}
        <div className="lg:col-span-2 space-y-6">
          {/* ---- Status Card ---- */}
          <Card padding="md">
            <SectionHeader
              icon={<CircleDot className="w-4 h-4 text-gray-600" />}
              title="Status"
            />

            {/* Current Stage */}
            {currentStage && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Aktuelle Phase</p>
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded-lg text-white"
                    style={{ backgroundColor: currentStage.color }}
                  >
                    {currentStage.name}
                  </span>
                  {timeInStage !== null && (
                    <span className="text-xs text-gray-400">
                      seit {formatDuration(timeInStage)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Recruiting Status */}
            {recStatus && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">
                  Recruiting Status
                </p>
                <Badge tone={recStatus.tone}>{recStatus.label}</Badge>
              </div>
            )}

            {/* Stage Change */}
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowStageDropdown(!showStageDropdown)}
                disabled={stageChanging}
                className="w-full"
              >
                <ChevronDown className="w-4 h-4" />
                Phase aendern
              </Button>
              {showStageDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 py-1 max-h-64 overflow-y-auto">
                  {stages.map((stage) => (
                    <button
                      key={stage.id}
                      onClick={() => changeStage(stage.id)}
                      disabled={
                        stage.id === candidate.current_stage_id ||
                        stageChanging
                      }
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                        stage.id === candidate.current_stage_id
                          ? 'opacity-40 cursor-not-allowed'
                          : 'cursor-pointer'
                      }`}
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stage.color }}
                      />
                      {stage.name}
                      {stage.id === candidate.current_stage_id && (
                        <Check className="w-4 h-4 text-gray-400 ml-auto" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* ---- Speed-to-Lead Card ---- */}
          <Card padding="md">
            <SectionHeader
              icon={<Zap className="w-4 h-4 text-amber-500" />}
              title="Speed-to-Lead"
            />
            <div className="space-y-1 divide-y divide-gray-100">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-500">Erster Anruf</span>
                {ttfd !== null ? (
                  <span className="text-sm font-medium text-gray-900">
                    {formatDuration(ttfd)}
                  </span>
                ) : (
                  <span className="text-sm text-amber-500 font-medium">
                    Noch nicht angerufen
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-500">
                  Erster Kontakt
                </span>
                {ttfc !== null ? (
                  <span className="text-sm font-medium text-gray-900">
                    {formatDuration(ttfc)}
                  </span>
                ) : firstDialMs !== null ? (
                  <span className="text-sm text-amber-500 font-medium">
                    Noch nicht erreicht
                  </span>
                ) : (
                  <span className="text-sm text-gray-300">&mdash;</span>
                )}
              </div>
              {ttfc !== null && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-500">TTFC</span>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${ttfcTrafficLight(ttfc).dotColor}`}
                    />
                    <span
                      className={`text-sm font-medium ${ttfcTrafficLight(ttfc).textColor}`}
                    >
                      {ttfcTrafficLight(ttfc).label}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* ---- Consent & Status Card ---- */}
          <Card
            padding="md"
            className={
              candidate.do_not_contact
                ? 'border-red-300 bg-red-50/30'
                : ''
            }
          >
            <SectionHeader
              icon={<Shield className="w-4 h-4 text-gray-600" />}
              title="Consent & Status"
            />

            {candidate.do_not_contact && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-red-50 rounded-lg border border-red-200">
                <Ban className="w-4 h-4 text-red-600" />
                <span className="text-sm font-semibold text-red-700">
                  NICHT KONTAKTIEREN
                </span>
              </div>
            )}

            <div className="space-y-0">
              <ConsentRow
                label="WhatsApp Opt-in"
                active={candidate.whatsapp_opt_in}
                unknown={candidate.whatsapp_opt_in === undefined}
              />
              <ConsentRow
                label="E-Mail Opt-in"
                active={candidate.email_opt_in}
                unknown={candidate.email_opt_in === undefined}
              />
              <ConsentRow
                label="Aufnahme-Einwilligung"
                active={candidate.recording_consent}
                unknown={candidate.recording_consent === undefined}
              />
            </div>
          </Card>

          {/* ---- No-Show & Kadenz Card ---- */}
          <Card
            padding="md"
            className={
              candidate.blacklisted
                ? 'border-red-300 bg-red-50/30'
                : ''
            }
          >
            <SectionHeader
              icon={<ShieldX className="w-4 h-4 text-gray-600" />}
              title="No-Show & Kadenz"
              badge={
                candidate.blacklisted ? (
                  <Badge tone="accent">Gesperrt</Badge>
                ) : undefined
              }
            />

            {/* No-Show Points */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">
                  No-Show Punkte
                </span>
                <span className={`text-sm font-semibold ${noshowColor}`}>
                  {noshowPoints.toFixed(1)} / 3.0
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    noshowPoints >= 3
                      ? 'bg-red-500'
                      : noshowPoints >= 2
                        ? 'bg-amber-500'
                        : 'bg-green-500'
                  }`}
                  style={{
                    width: `${Math.min((noshowPoints / 3) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Blacklist info */}
            {candidate.blacklisted && candidate.blacklist_reason && (
              <div className="mb-4 p-3 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-medium text-red-700">
                    {candidate.blacklist_reason}
                  </span>
                </div>
              </div>
            )}

            {/* Cadence */}
            <div className="border-t border-gray-100 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Kadenz</span>
                {candidate.cadence_active ? (
                  <Badge tone="success">Aktiv</Badge>
                ) : (
                  <Badge tone="neutral">Inaktiv</Badge>
                )}
              </div>
              {candidate.cadence_attempt != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Versuch</span>
                  <span className="text-sm font-medium text-gray-900">
                    {candidate.cadence_attempt} / 6
                  </span>
                </div>
              )}
              {candidate.preferred_call_window && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Bevorzugtes Fenster
                  </span>
                  <span className="text-sm text-gray-900">
                    {WINDOW_LABELS[candidate.preferred_call_window] ??
                      candidate.preferred_call_window}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* ---- Vorquali Card ---- */}
          {hasVorquali && (
            <Card padding="md">
              <SectionHeader
                icon={<FileText className="w-4 h-4 text-gray-600" />}
                title="Vorqualifizierung"
              />
              <div className="space-y-2">
                {Object.entries(vorquali!).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-start justify-between py-1.5"
                  >
                    <span className="text-sm text-gray-500 capitalize">
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span className="text-sm font-medium text-gray-900 text-right ml-4 max-w-[60%]">
                      {typeof value === 'boolean'
                        ? value
                          ? 'Ja'
                          : 'Nein'
                        : String(value ?? '-')}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ---- CV/Resume Card ---- */}
          {(candidate.resume_url ||
            candidate.experience_summary ||
            candidate.last_employer) && (
            <Card padding="md">
              <SectionHeader
                icon={<Briefcase className="w-4 h-4 text-gray-600" />}
                title="Lebenslauf & Erfahrung"
              />
              <div className="space-y-3">
                {candidate.last_employer && (
                  <InfoRow label="Letzter AG">
                    {candidate.last_employer}
                  </InfoRow>
                )}
                {candidate.experience_summary && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">
                      Erfahrung
                    </p>
                    <p className="text-sm text-gray-900 leading-relaxed">
                      {candidate.experience_summary}
                    </p>
                  </div>
                )}
                {candidate.resume_url && (
                  <a
                    href={candidate.resume_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 transition"
                  >
                    <Download className="w-4 h-4" />
                    Lebenslauf herunterladen
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                )}
              </div>
            </Card>
          )}

          {/* ---- Notizen Card (sidebar view) ---- */}
          <Card padding="md">
            <SectionHeader
              icon={<StickyNote className="w-4 h-4 text-gray-600" />}
              title="Notizen"
              badge={
                notes.length > 0 ? (
                  <Badge tone="neutral">{notes.length}</Badge>
                ) : undefined
              }
            />
            <div className="space-y-3">
              {notes.slice(0, 5).map((note) => (
                <div
                  key={note.id}
                  className="p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <p className="text-sm text-gray-900">{note.text}</p>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {note.user.name} &middot; {timeAgo(note.created_at)}
                  </p>
                </div>
              ))}
              {notes.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-2">
                  Keine Notizen vorhanden.
                </p>
              )}
              {notes.length > 5 && (
                <p className="text-xs text-gray-400 text-center">
                  + {notes.length - 5} weitere Notizen
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
