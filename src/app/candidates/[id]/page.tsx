'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Candidate, CandidateStage, Note, PipelineStage } from '@/lib/types/database';

type StageHistoryEntry = CandidateStage & { stage: PipelineStage; user: { name: string } | null };
type NoteWithUser = Note & { user: { name: string } };

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [stageHistory, setStageHistory] = useState<StageHistoryEntry[]>([]);
  const [notes, setNotes] = useState<NoteWithUser[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/candidates/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setCandidate(data.candidate);
        setStageHistory(data.stageHistory || []);
        setNotes(data.notes || []);
        setLoading(false);
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

  if (loading) return <p className="p-8 text-gray-500">Laden...</p>;
  if (!candidate) return <p className="p-8 text-gray-500">Bewerber nicht gefunden.</p>;

  const sourceLabels: Record<string, string> = { meta: 'Meta', indeed: 'Indeed', manual: 'Manuell' };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <button onClick={() => router.push('/dashboard')} className="text-blue-600 hover:underline text-sm mb-4 inline-block">
        &larr; Zurück zur Pipeline
      </button>

      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{candidate.name}</h1>
        <p className="text-gray-500 text-sm mb-6">
          {sourceLabels[candidate.source]} &middot; Hinzugefügt am {new Date(candidate.created_at).toLocaleDateString('de-DE')}
        </p>

        {/* Contact Info */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-sm font-medium text-gray-500 uppercase mb-3">Kontaktdaten</h2>
          <div className="space-y-2 text-sm">
            {candidate.email && <p><span className="text-gray-500">E-Mail:</span> {candidate.email}</p>}
            {candidate.phone && <p><span className="text-gray-500">Telefon:</span> {candidate.phone}</p>}
            {candidate.meta_campaign && <p><span className="text-gray-500">Kampagne:</span> {candidate.meta_campaign}</p>}
            {candidate.meta_adset && <p><span className="text-gray-500">Adset:</span> {candidate.meta_adset}</p>}
          </div>
        </div>

        {/* Stage Timeline */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-sm font-medium text-gray-500 uppercase mb-3">Phasen-Verlauf</h2>
          <div className="space-y-3">
            {stageHistory.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 text-sm">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: entry.stage.color }} />
                <span className="font-medium text-gray-900">{entry.stage.name}</span>
                <span className="text-gray-400">
                  {new Date(entry.changed_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                {entry.user && <span className="text-gray-400">von {entry.user.name}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-medium text-gray-500 uppercase mb-3">Notizen</h2>
          <form onSubmit={addNote} className="flex gap-2 mb-4">
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Notiz hinzufügen..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              Speichern
            </button>
          </form>
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="text-sm">
                <p className="text-gray-900">{note.text}</p>
                <p className="text-gray-400 text-xs mt-1">
                  {note.user.name} &middot; {new Date(note.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
            {notes.length === 0 && <p className="text-gray-400 text-sm">Noch keine Notizen.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
