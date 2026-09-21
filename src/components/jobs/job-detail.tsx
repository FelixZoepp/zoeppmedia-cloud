'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import { ArrowLeft, Play, Pause, X, Save, Files, Bot, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { BotConfigForm } from '@/components/bot/bot-config-form';
import { BotSimulator } from '@/components/bot/bot-simulator';
import { AvailabilityEditor } from '@/components/jobs/availability-editor';

type JobTab = 'details' | 'ki-bot' | 'termine';

const EMPLOYMENT_TYPES = [
  { value: '', label: 'Bitte waehlen' },
  { value: 'Vollzeit', label: 'Vollzeit' },
  { value: 'Teilzeit', label: 'Teilzeit' },
  { value: 'Minijob', label: 'Minijob' },
  { value: 'Freelance', label: 'Freelance / Selbststaendig' },
  { value: 'Praktikum', label: 'Praktikum' },
];

interface JobDetailData {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  location: string | null;
  postal_code: string | null;
  employment_type: string | null;
  salary_range: string | null;
  status: 'draft' | 'active' | 'paused' | 'closed';
  indeed_mode: string;
  created_at: string;
  applications: { count: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf', active: 'Aktiv', paused: 'Pausiert', closed: 'Geschlossen',
};

export function JobDetail({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<JobDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<JobDetailData>>({});
  const [activeTab, setActiveTab] = useState<JobTab>('details');

  useEffect(() => {
    fetch(`/api/jobs/${jobId}`)
      .then((r) => r.json())
      .then((data) => {
        setJob(data);
        setEditForm(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [jobId]);

  async function handleStatusChange(newStatus: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setJob(updated);
      toast.success(`Status geaendert: ${STATUS_LABELS[newStatus]}`);
    } catch {
      toast.error('Fehler beim Statuswechsel');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          location: editForm.location,
          postal_code: editForm.postal_code,
          employment_type: editForm.employment_type,
          salary_range: editForm.salary_range,
        }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setJob(updated);
      setEditing(false);
      toast.success('Gespeichert');
    } catch {
      toast.error('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/duplicate`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const copy = await res.json();
      toast.success('Stelle dupliziert');
      router.push(`/jobs/${copy.id}`);
    } catch {
      toast.error('Fehler beim Duplizieren');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !job) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  const appCount = job.applications?.[0]?.count ?? 0;

  return (
    <div>
      <PageHeader
        label="STELLENANZEIGE"
        title={job.title}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/jobs')}>
              <ArrowLeft className="w-4 h-4" />
              Zurueck
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDuplicate} disabled={saving}>
              <Files className="w-4 h-4" />
              Duplizieren
            </Button>
            {job.status === 'draft' && (
              <Button size="sm" onClick={() => handleStatusChange('active')} disabled={saving}>
                <Play className="w-4 h-4" />
                Aktivieren
              </Button>
            )}
            {job.status === 'active' && (
              <Button variant="ghost" size="sm" onClick={() => handleStatusChange('paused')} disabled={saving}>
                <Pause className="w-4 h-4" />
                Pausieren
              </Button>
            )}
            {job.status === 'paused' && (
              <Button size="sm" onClick={() => handleStatusChange('active')} disabled={saving}>
                <Play className="w-4 h-4" />
                Aktivieren
              </Button>
            )}
            {(job.status === 'active' || job.status === 'paused') && (
              <Button variant="ghost" size="sm" onClick={() => handleStatusChange('closed')} disabled={saving}>
                <X className="w-4 h-4" />
                Schliessen
              </Button>
            )}
          </div>
        }
      />

      {/* Tab-Navigation */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab('details')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'details'
              ? 'border-red-500 text-red-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ki-bot')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'ki-bot'
              ? 'border-red-500 text-red-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          KI-Bot
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('termine')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'termine'
              ? 'border-red-500 text-red-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          Termine
        </button>
      </div>

      {/* Tab: KI-Bot */}
      {activeTab === 'ki-bot' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <BotConfigForm jobId={jobId} />
          </div>
          <div>
            <BotSimulator jobId={jobId} />
          </div>
        </div>
      )}

      {/* Tab: Termine */}
      {activeTab === 'termine' && (
        <div className="max-w-2xl">
          <AvailabilityEditor jobId={jobId} />
        </div>
      )}

      {/* Tab: Details */}
      {activeTab === 'details' && (
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Details</h3>
              {!editing && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  Bearbeiten
                </Button>
              )}
            </div>

            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Titel</label>
                  <Input
                    value={editForm.title || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
                  <textarea
                    value={editForm.description || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                    rows={6}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none resize-y"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Standort</label>
                    <Input
                      value={editForm.location || ''}
                      onChange={(e) => setEditForm((p) => ({ ...p, location: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PLZ</label>
                    <Input
                      value={editForm.postal_code || ''}
                      onChange={(e) => setEditForm((p) => ({ ...p, postal_code: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Anstellungsart</label>
                    <Select
                      value={editForm.employment_type || ''}
                      onChange={(e) => setEditForm((p) => ({ ...p, employment_type: e.target.value }))}
                      options={EMPLOYMENT_TYPES}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gehaltsspanne</label>
                    <Input
                      value={editForm.salary_range || ''}
                      onChange={(e) => setEditForm((p) => ({ ...p, salary_range: e.target.value }))}
                      placeholder="z.B. 3.000-5.000 EUR"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="w-4 h-4" />
                    {saving ? 'Speichert...' : 'Speichern'}
                  </Button>
                  <Button variant="ghost" onClick={() => { setEditing(false); setEditForm(job); }}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {job.description && (
                  <div className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
                    {job.description}
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {job.location && (
                    <div><dt className="text-gray-500">Standort</dt><dd className="text-gray-900">{job.location}</dd></div>
                  )}
                  {job.postal_code && (
                    <div><dt className="text-gray-500">PLZ</dt><dd className="text-gray-900">{job.postal_code}</dd></div>
                  )}
                  {job.employment_type && (
                    <div><dt className="text-gray-500">Anstellungsart</dt><dd className="text-gray-900">{job.employment_type}</dd></div>
                  )}
                  {job.salary_range && (
                    <div><dt className="text-gray-500">Gehaltsspanne</dt><dd className="text-gray-900">{job.salary_range}</dd></div>
                  )}
                </dl>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Status</p>
            <Badge tone={job.status === 'active' ? 'accent' : 'neutral'}>
              {STATUS_LABELS[job.status]}
            </Badge>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Bewerbungen</p>
            <p className="text-2xl font-bold text-gray-900">{appCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Erstellt</p>
            <p className="text-sm text-gray-900">{new Date(job.created_at).toLocaleDateString('de-DE')}</p>
          </Card>
        </div>
      </div>
      )}
    </div>
  );
}
