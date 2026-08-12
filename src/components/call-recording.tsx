'use client';

import { useState, useRef } from 'react';
import { Upload, Mic, FileAudio, CheckCircle, AlertCircle, Clock, ChevronDown, ChevronUp, Star } from 'lucide-react';
import { Button, Badge, Card } from '@/components/ui';
import type { CallRecording, CallRecordingAnalysis } from '@/lib/types/database';

const typeLabels: Record<string, string> = {
  erstgespraech: 'Erstgespräch',
  vorstellungsgespraech: 'Vorstellungsgespräch',
  follow_up: 'Follow-Up',
  sonstiges: 'Sonstiges',
};

const typeOptions = [
  { value: 'erstgespraech', label: 'Erstgespräch' },
  { value: 'vorstellungsgespraech', label: 'Vorstellungsgespräch' },
  { value: 'follow_up', label: 'Follow-Up' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
  pending: { label: 'Ausstehend', icon: Clock, color: 'text-gray-400' },
  processing: { label: 'Wird verarbeitet...', icon: Clock, color: 'text-amber-500' },
  done: { label: 'Fertig', icon: CheckCircle, color: 'text-green-500' },
  failed: { label: 'Fehlgeschlagen', icon: AlertCircle, color: 'text-red-500' },
};

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-900">{score}/100</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function AnalysisView({ analysis }: { analysis: CallRecordingAnalysis }) {
  return (
    <div className="space-y-10 mt-5">
      <div className="grid grid-cols-3 gap-8">
        <ScoreBar label="Skript-Treue" score={analysis.script_adherence_score} />
        <ScoreBar label="Gesprächsqualität" score={analysis.conversation_quality_score} />
        <ScoreBar label="Gesamt" score={analysis.overall_score} />
      </div>

      <p className="text-sm text-gray-700 leading-relaxed">{analysis.summary}</p>

      {analysis.strengths.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-green-700 mb-2">Stärken</p>
          <ul className="space-y-5">
            {analysis.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <Star className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.improvements.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-amber-700 mb-2">Verbesserungsvorschläge</p>
          <ul className="space-y-5">
            {analysis.improvements.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.key_moments.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Schlüsselmomente</p>
          <div className="space-y-3">
            {analysis.key_moments.map((m, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="text-gray-400 font-mono shrink-0">{m.timestamp}</span>
                <span className="text-gray-700">{m.note}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface CallRecordingsPanelProps {
  candidateId: string;
  recordings: CallRecording[];
  onRecordingAdded: (rec: CallRecording) => void;
}

export function CallRecordingsPanel({ candidateId, recordings, onRecordingAdded }: CallRecordingsPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [recordingType, setRecordingType] = useState('erstgespraech');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      setError('Datei zu groß (max 100MB)');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('recording_type', recordingType);

      const res = await fetch(`/api/candidates/${candidateId}/recordings`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const recording = await res.json();
        onRecordingAdded(recording);
      } else {
        const err = await res.json();
        setError(err.error || 'Upload fehlgeschlagen');
      }
    } catch {
      setError('Upload fehlgeschlagen');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-8 flex items-center gap-2">
        <Mic className="w-5 h-5 text-red-500" />
        Gesprächsaufnahmen
      </h3>

      {/* Upload Area */}
      <div className="flex items-center gap-6 mb-10">
        <select
          value={recordingType}
          onChange={(e) => setRecordingType(e.target.value)}
          className="rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-red-300 focus:ring-1 focus:ring-red-200 outline-none"
        >
          {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-4 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-red-200 hover:text-red-500 transition"
        >
          {uploading ? (
            <span className="animate-pulse">Wird hochgeladen & analysiert...</span>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Audio/Video hochladen (MP3, MP4, M4A, WAV)
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,video/*,.mp3,.mp4,.m4a,.wav,.webm,.ogg,.flac"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {/* Recordings List */}
      {recordings.length > 0 ? (
        <div className="space-y-8">
          {recordings.map(rec => {
            const isExpanded = expandedId === rec.id;
            const transcriptStatus = statusConfig[rec.transcript_status];
            const analysisStatus = statusConfig[rec.analysis_status];
            const TranscriptIcon = transcriptStatus.icon;
            const AnalysisIcon = analysisStatus.icon;

            return (
              <div key={rec.id} className="border border-gray-100 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                  className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                      <FileAudio className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{rec.file_name}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <Badge tone="softAccent">{typeLabels[rec.recording_type] || rec.recording_type}</Badge>
                        <span className="text-xs text-gray-400">{new Date(rec.created_at).toLocaleString('de-DE')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-xs">
                      <TranscriptIcon className={`w-3.5 h-3.5 ${transcriptStatus.color}`} />
                      <span className="text-gray-500">Transkript</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <AnalysisIcon className={`w-3.5 h-3.5 ${analysisStatus.color}`} />
                      <span className="text-gray-500">Analyse</span>
                    </div>
                    {rec.analysis && (
                      <div className="text-sm font-semibold text-gray-900">
                        {(rec.analysis as CallRecordingAnalysis).overall_score}/100
                      </div>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-6 pb-6 border-t border-gray-100">
                    {/* Transcript */}
                    {rec.transcript && (
                      <div className="mt-5">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Transkript</p>
                        <div className="bg-gray-50 rounded-xl p-6 text-sm text-gray-700 leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap">
                          {rec.transcript}
                        </div>
                      </div>
                    )}

                    {rec.transcript_status === 'processing' && (
                      <p className="mt-4 text-sm text-amber-600 animate-pulse">Transkript wird erstellt...</p>
                    )}

                    {/* Analysis */}
                    {rec.analysis && rec.analysis_status === 'done' && (
                      <AnalysisView analysis={rec.analysis as CallRecordingAnalysis} />
                    )}

                    {rec.analysis_status === 'processing' && (
                      <p className="mt-4 text-sm text-amber-600 animate-pulse">KI-Analyse läuft...</p>
                    )}

                    {rec.analysis_status === 'failed' && (
                      <p className="mt-4 text-sm text-red-500">Analyse fehlgeschlagen. Bitte versuche es erneut.</p>
                    )}

                    {/* Audio Player */}
                    {rec.file_url && (
                      <div className="mt-4">
                        <audio controls className="w-full" src={rec.file_url}>
                          Dein Browser unterstützt kein Audio.
                        </audio>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-6">Noch keine Aufnahmen hochgeladen</p>
      )}
    </Card>
  );
}
